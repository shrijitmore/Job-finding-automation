import type { LlmClient } from "@jfa/core";
import type { AtsKind, SourceSeed } from "@jfa/shared";
import type { PoliteFetcher } from "./http";

/** One listing as returned by a plugin, before normalization. */
export interface RawListing {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  postedDate: string;
  applyEmail: string;
  applyUrl?: string;
  jobType: string;
  workMode?: string;
  ats?: AtsKind;
  atsBoardToken?: string;
  atsJobId?: string;
}

export interface PageCacheStore {
  get(url: string): Promise<{ contentHash: string; extracted: unknown } | null>;
  set(url: string, contentHash: string, extracted: unknown): Promise<void>;
}

export interface ScrapeLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
}

export interface SourceInput {
  id: string;
  name: string;
  plugin: SourceSeed["plugin"];
  url: string;
  fields: string[];
  config: NonNullable<SourceSeed["config"]>;
}

export interface ScrapeContext {
  source: SourceInput;
  fetcher: PoliteFetcher;
  llm: LlmClient | null;
  cache: PageCacheStore;
  log: ScrapeLogger;
  /** Max listings to return for this source. */
  maxListings: number;
  /** Max detail pages to fetch for this source. */
  maxDetails: number;
  /** Stop following detail pages after this long (ms); later listings keep their summary. */
  detailBudgetMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
  /** True when a job with this URL is already stored, so its detail page is skipped. */
  isKnown(url: string): Promise<boolean>;
}

export interface SourcePlugin {
  id: SourceSeed["plugin"];
  scrape(ctx: ScrapeContext): Promise<RawListing[]>;
}
