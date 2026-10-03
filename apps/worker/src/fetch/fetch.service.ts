import { Inject, Injectable, Logger } from "@nestjs/common";
import type { LlmClient } from "@jfa/core";
import { eq, inArray, jobs, or, sources, sql, type Db, type Source } from "@jfa/db";
import { BrowserRenderer, PoliteFetcher, canonicalUrl, dedupeHash, scrapeSource, type ScrapeOutcome } from "@jfa/scraper";
import type { NormalizedJob } from "@jfa/shared";
import { CONFIG, type WorkerConfig } from "../config";
import { DB } from "../infra.module";
import { DbPageCache } from "./page-cache";

export interface SourceReport {
  sourceId: string;
  name: string;
  status: ScrapeOutcome["status"] | "skipped";
  jobs: number;
  newJobs: number;
  error?: string;
  durationMs: number;
}

export interface FetchReport {
  jobIds: string[];
  newJobIds: string[];
  sources: SourceReport[];
  blocked: string[];
}

export interface EventLogger {
  info(step: string, message: string, data?: Record<string, unknown>): void;
  warn(step: string, message: string, data?: Record<string, unknown>): void;
}

const BLOCK_BACKOFF_MS = 24 * 60 * 60 * 1000;
const SOURCE_CONCURRENCY = 3;

@Injectable()
export class FetchService {
  private readonly logger = new Logger(FetchService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: WorkerConfig,
  ) {}

  /** Scrapes sources with per-source isolation and stores normalized, deduplicated jobs. */
  async fetchSources(list: Source[], llm: LlmClient | null, events?: EventLogger): Promise<FetchReport> {
    const renderer = new BrowserRenderer(this.config.CHROMIUM_PATH);
    const fetcher = new PoliteFetcher({
      minDelayMs: this.config.SCRAPE_MIN_DELAY_MS,
      maxDelayMs: this.config.SCRAPE_MAX_DELAY_MS,
      renderer,
    });
    const cache = new DbPageCache(this.db);
    const report: FetchReport = { jobIds: [], newJobIds: [], sources: [], blocked: [] };
    const queue = [...list];

    const work = async () => {
      for (let source = queue.shift(); source; source = queue.shift()) {
        report.sources.push(await this.fetchOne(source, fetcher, cache, llm, report, events));
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(SOURCE_CONCURRENCY, list.length) }, work));
    } finally {
      await renderer.close();
    }
    report.jobIds = [...new Set(report.jobIds)];
    return report;
  }

  private async fetchOne(
    source: Source,
    fetcher: PoliteFetcher,
    cache: DbPageCache,
    llm: LlmClient | null,
    report: FetchReport,
    events?: EventLogger,
  ): Promise<SourceReport> {
    if (source.blockedUntil && source.blockedUntil > new Date()) {
      events?.info("fetch", `Skipping ${source.name}: backing off after a block until ${source.blockedUntil.toISOString()}`);
      report.blocked.push(source.name);
      return { sourceId: source.id, name: source.name, status: "skipped", jobs: 0, newJobs: 0, error: "Backing off after block", durationMs: 0 };
    }
    const config = source.config as { maxListings?: number; render?: boolean; followDetails?: boolean };
    const outcome = await scrapeSource({
      source: { id: source.id, name: source.name, plugin: source.plugin as never, url: source.url, fields: source.fields, config },
      fetcher,
      llm,
      cache,
      maxListings: config.maxListings ?? 40,
      maxDetails: 15,
      detailBudgetMs: this.config.SCRAPE_DETAIL_BUDGET_MS,
      isKnown: async (url) => {
        const [row] = await this.db.select({ id: jobs.id }).from(jobs).where(eq(jobs.canonicalUrl, canonicalUrl(url)));
        return Boolean(row);
      },
      log: {
        info: (m, d) => events?.info("fetch", `${source.name}: ${m}`, d),
        warn: (m, d) => events?.warn("fetch", `${source.name}: ${m}`, d),
      },
    });

    const { ids, newIds } = outcome.status === "ok" ? await this.persist(outcome.jobs) : { ids: [], newIds: [] };
    report.jobIds.push(...ids);
    report.newJobIds.push(...newIds);
    if (outcome.status === "blocked") report.blocked.push(source.name);

    await this.db
      .update(sources)
      .set({
        lastRunAt: new Date(),
        lastStatus: outcome.status,
        lastError: outcome.error ?? null,
        lastJobCount: outcome.jobs.length,
        totalJobCount: sql`${sources.totalJobCount} + ${newIds.length}`,
        blockedUntil: outcome.status === "blocked" ? new Date(Date.now() + BLOCK_BACKOFF_MS) : null,
      })
      .where(eq(sources.id, source.id));

    const msg = `${source.name}: ${outcome.status}, ${outcome.jobs.length} jobs (${newIds.length} new) in ${Math.round(outcome.durationMs / 1000)}s`;
    if (outcome.status === "ok") events?.info("fetch", msg);
    else events?.warn("fetch", `${msg}. ${outcome.error ?? ""}`.trim());
    this.logger.log(msg);
    return { sourceId: source.id, name: source.name, status: outcome.status, jobs: outcome.jobs.length, newJobs: newIds.length, error: outcome.error, durationMs: outcome.durationMs };
  }

  /**
   * Upserts jobs. A job matches an existing row by canonical URL or by company + title hash,
   * so the same role found on two boards is stored once.
   */
  async persist(list: NormalizedJob[]): Promise<{ ids: string[]; newIds: string[] }> {
    if (!list.length) return { ids: [], newIds: [] };
    const withHash = list.map((j) => ({ ...j, hash: dedupeHash(j.company, j.title) }));
    const existing = await this.db
      .select({ id: jobs.id, canonicalUrl: jobs.canonicalUrl, dedupeHash: jobs.dedupeHash, description: jobs.description })
      .from(jobs)
      .where(or(inArray(jobs.canonicalUrl, withHash.map((j) => j.canonicalUrl)), inArray(jobs.dedupeHash, withHash.map((j) => j.hash))));
    const byUrl = new Map(existing.map((e) => [e.canonicalUrl, e]));
    const byHash = new Map(existing.map((e) => [e.dedupeHash, e]));
    const ids: string[] = [];
    const newIds: string[] = [];

    for (const j of withHash) {
      const match = byUrl.get(j.canonicalUrl) ?? byHash.get(j.hash);
      if (match) {
        ids.push(match.id);
        await this.db
          .update(jobs)
          .set({
            lastSeenAt: new Date(),
            ...(j.description.length > match.description.length ? { description: j.description } : {}),
          })
          .where(eq(jobs.id, match.id));
        continue;
      }
      const [row] = await this.db
        .insert(jobs)
        .values({
          canonicalUrl: j.canonicalUrl,
          dedupeHash: j.hash,
          title: j.title,
          company: j.company,
          location: j.location,
          url: j.url,
          description: j.description,
          postedAt: j.postedAt ? new Date(j.postedAt) : null,
          applyEmail: j.applyEmail,
          applyUrl: j.applyUrl,
          jobType: j.jobType,
          workMode: j.workMode,
          ats: j.ats,
          atsBoardToken: j.atsBoardToken,
          atsJobId: j.atsJobId,
          sourceId: j.sourceId || null,
          fields: j.fields,
        })
        .onConflictDoUpdate({ target: jobs.canonicalUrl, set: { lastSeenAt: new Date() } })
        .returning({ id: jobs.id });
      ids.push(row.id);
      newIds.push(row.id);
      byUrl.set(j.canonicalUrl, { id: row.id, canonicalUrl: j.canonicalUrl, dedupeHash: j.hash, description: j.description });
      byHash.set(j.hash, { id: row.id, canonicalUrl: j.canonicalUrl, dedupeHash: j.hash, description: j.description });
    }
    return { ids, newIds };
  }
}
