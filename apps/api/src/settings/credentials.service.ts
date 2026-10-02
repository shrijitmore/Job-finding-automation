import { Inject, Injectable } from "@nestjs/common";
import { decryptJson, encryptJson, maskSecret } from "@jfa/core";
import { and, credentials, eq, isNull, type Credential, type Db } from "@jfa/db";
import { CONFIG, type AppConfig } from "../config";
import { DB } from "../db/db.module";

type Kind = Credential["kind"];

/** Stores secrets encrypted with ENCRYPTION_KEY. profileId null means account level. */
@Injectable()
export class CredentialsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private scope(userId: string, kind: Kind, profileId: string | null) {
    return and(
      eq(credentials.userId, userId),
      eq(credentials.kind, kind),
      profileId ? eq(credentials.profileId, profileId) : isNull(credentials.profileId),
    );
  }

  async get<T>(userId: string, kind: Kind, profileId: string | null = null): Promise<{ value: T; meta: Record<string, unknown> } | null> {
    const [row] = await this.db.select().from(credentials).where(this.scope(userId, kind, profileId));
    if (!row) return null;
    return { value: decryptJson<T>(row.ciphertext, this.config.ENCRYPTION_KEY), meta: row.meta };
  }

  async set(userId: string, kind: Kind, profileId: string | null, value: unknown, meta: Record<string, unknown> = {}): Promise<void> {
    const ciphertext = encryptJson(value, this.config.ENCRYPTION_KEY);
    await this.db.delete(credentials).where(this.scope(userId, kind, profileId));
    await this.db.insert(credentials).values({ userId, profileId, kind, ciphertext, meta });
  }

  async remove(userId: string, kind: Kind, profileId: string | null = null): Promise<void> {
    await this.db.delete(credentials).where(this.scope(userId, kind, profileId));
  }

  async anthropicKey(userId: string): Promise<{ key: string; source: "saved" | "env" } | null> {
    const saved = await this.get<{ apiKey: string }>(userId, "anthropic");
    if (saved?.value.apiKey) return { key: saved.value.apiKey, source: "saved" };
    if (this.config.ANTHROPIC_API_KEY) return { key: this.config.ANTHROPIC_API_KEY, source: "env" };
    return null;
  }

  async anthropicStatus(userId: string) {
    const k = await this.anthropicKey(userId);
    return { configured: Boolean(k), source: k?.source ?? null, masked: k ? maskSecret(k.key) : null };
  }
}
