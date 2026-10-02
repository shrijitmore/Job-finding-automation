import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { QUEUES, type PgBoss, type SourceScanJob } from "@jfa/core";
import { and, asc, eq, isNull, sources, users, type Db, type Source } from "@jfa/db";
import { PROPOSED_SOURCES, SEED_SOURCES, detectPlugin, isBlockedHost, type SourceSeed } from "@jfa/shared";
import { DB } from "../db/db.module";
import { BOSS } from "../queue/queue.module";

export interface CreateSourceInput {
  url: string;
  name?: string;
  plugin?: SourceSeed["plugin"];
  fields: string[];
  config?: SourceSeed["config"];
}

@Injectable()
export class SourcesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(BOSS) private readonly boss: PgBoss,
  ) {}

  /** Adds the default sources the first time an account opens its sources. */
  async ensureSeeded(userId: string): Promise<void> {
    const [claimed] = await this.db
      .update(users)
      .set({ sourcesSeededAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.sourcesSeededAt)))
      .returning({ id: users.id });
    if (!claimed) return;
    await this.db
      .insert(sources)
      .values(SEED_SOURCES.map((s) => ({ userId, name: s.name, plugin: s.plugin, url: s.url, fields: s.fields, config: s.config ?? {} })))
      .onConflictDoNothing();
  }

  async list(userId: string): Promise<Source[]> {
    await this.ensureSeeded(userId);
    return this.db.select().from(sources).where(eq(sources.userId, userId)).orderBy(asc(sources.createdAt), asc(sources.name));
  }

  async proposed(userId: string): Promise<SourceSeed[]> {
    const existing = new Set((await this.list(userId)).map((s) => s.url));
    return PROPOSED_SOURCES.filter((p) => !existing.has(p.url));
  }

  async get(userId: string, id: string): Promise<Source> {
    const [row] = await this.db.select().from(sources).where(and(eq(sources.id, id), eq(sources.userId, userId)));
    if (!row) throw new NotFoundException("Source not found");
    return row;
  }

  async create(userId: string, input: CreateSourceInput): Promise<Source> {
    let url: URL;
    try {
      url = new URL(input.url.trim());
    } catch {
      throw new BadRequestException("Enter a full URL starting with https://");
    }
    if (!/^https?:$/.test(url.protocol)) throw new BadRequestException("Only http and https URLs are supported");
    if (isBlockedHost(url.toString())) throw new BadRequestException("LinkedIn, Naukri and Indeed are never scraped");
    const plugin = input.plugin ?? detectPlugin(url.toString());
    const name = input.name?.trim() || url.hostname.replace(/^www\./, "");
    const [row] = await this.db
      .insert(sources)
      .values({ userId, name, plugin, url: url.toString(), fields: input.fields, config: input.config ?? {} })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new ConflictException("That source is already in your list");
    return row;
  }

  async update(userId: string, id: string, patch: Partial<Pick<Source, "name" | "enabled" | "fields" | "config">>): Promise<Source> {
    await this.get(userId, id);
    const [row] = await this.db
      .update(sources)
      .set({ ...patch, ...(patch.enabled ? { blockedUntil: null } : {}) })
      .where(eq(sources.id, id))
      .returning();
    return row;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.get(userId, id);
    await this.db.delete(sources).where(eq(sources.id, id));
  }

  async scan(userId: string, id: string): Promise<{ jobId: string | null }> {
    await this.get(userId, id);
    const data: SourceScanJob = { sourceId: id };
    const jobId = await this.boss.send(QUEUES.sourceScan, data, { singletonKey: id, retryLimit: 0, expireInSeconds: 900 });
    return { jobId };
  }
}
