import { isBlockedHost, type NormalizedJob } from "@jfa/shared";
import { BlockedError, RobotsDisallowedError } from "./errors";
import { dedupeJobs, normalizeListing } from "./normalize";
import { PLUGINS } from "./registry";
import type { ScrapeContext } from "./types";

export interface ScrapeOutcome {
  status: "ok" | "blocked" | "error";
  jobs: NormalizedJob[];
  error?: string;
  durationMs: number;
}

/** Runs one source. Never throws: failures are returned so one broken source cannot stop a run. */
export async function scrapeSource(ctx: ScrapeContext, now = new Date()): Promise<ScrapeOutcome> {
  const started = Date.now();
  const done = (o: Omit<ScrapeOutcome, "durationMs">): ScrapeOutcome => ({ ...o, durationMs: Date.now() - started });
  if (isBlockedHost(ctx.source.url)) {
    return done({ status: "error", jobs: [], error: "This site is never scraped by policy" });
  }
  const plugin = PLUGINS[ctx.source.plugin];
  if (!plugin) return done({ status: "error", jobs: [], error: `Unknown plugin ${ctx.source.plugin}` });
  try {
    const raw = await plugin.scrape(ctx);
    const jobs = raw
      .filter((r) => !isBlockedHost(r.url))
      .map((r) => normalizeListing(r, ctx.source.id, ctx.source.fields, now))
      .filter((j): j is NormalizedJob => j !== null);
    return done({ status: "ok", jobs: dedupeJobs(jobs) });
  } catch (err) {
    if (err instanceof BlockedError) {
      ctx.log.warn(`Blocked by ${new URL(err.url).host}: ${err.message}. Backing off.`);
      return done({ status: "blocked", jobs: [], error: err.message });
    }
    if (err instanceof RobotsDisallowedError) {
      return done({ status: "blocked", jobs: [], error: err.message });
    }
    return done({ status: "error", jobs: [], error: (err as Error).message });
  }
}
