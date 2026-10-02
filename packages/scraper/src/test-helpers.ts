import { readFileSync } from "node:fs";
import path from "node:path";
import { PoliteFetcher } from "./http";
import type { PageCacheStore, ScrapeContext, SourceInput } from "./types";
import type { LlmClient } from "@jfa/core";

export const fixture = (name: string) => readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");

export type Route = string | { status: number; body: string };

/** fetch stand-in that serves fixtures by exact URL. Unknown robots.txt returns 404. */
export function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url];
    if (r === undefined) return new Response("not found", { status: 404 });
    const { status, body } = typeof r === "string" ? { status: 200, body: r } : r;
    return new Response(body, { status, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  return { impl, calls };
}

export function memoryCache(): PageCacheStore & { store: Map<string, { contentHash: string; extracted: unknown }> } {
  const store = new Map<string, { contentHash: string; extracted: unknown }>();
  return {
    store,
    async get(url) {
      return store.get(url) ?? null;
    },
    async set(url, contentHash, extracted) {
      store.set(url, { contentHash, extracted });
    },
  };
}

export function makeCtx(
  source: Partial<SourceInput> & Pick<SourceInput, "plugin" | "url">,
  routes: Record<string, Route>,
  opts: { llm?: LlmClient | null; cache?: PageCacheStore; known?: string[] } = {},
): ScrapeContext & { calls: string[]; sleeps: number[] } {
  const { impl, calls } = fakeFetch(routes);
  const sleeps: number[] = [];
  const fetcher = new PoliteFetcher({
    fetchImpl: impl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
  });
  return {
    source: { id: "src-1", name: "Test Source", fields: ["engineering"], config: {}, ...source },
    fetcher,
    llm: opts.llm ?? null,
    cache: opts.cache ?? memoryCache(),
    log: { info: () => undefined, warn: () => undefined },
    maxListings: 50,
    maxDetails: 10,
    isKnown: async (url) => (opts.known ?? []).includes(url),
    calls,
    sleeps,
  };
}
