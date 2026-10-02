import robotsParser from "robots-parser";
import { BlockedError, RobotsDisallowedError, looksBlocked } from "./errors";

export const BOT_NAME = "JobAutopilotBot";
export const USER_AGENT = `Mozilla/5.0 (compatible; ${BOT_NAME}/0.1; +https://github.com/shrijitmore/Job-finding-automation)`;

export interface FetchResult {
  status: number;
  url: string;
  body: string;
  contentType: string;
}

export interface Renderer {
  render(url: string, userAgent: string): Promise<FetchResult>;
}

export interface PoliteFetcherOptions {
  minDelayMs?: number;
  maxDelayMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  renderer?: Renderer;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  timeoutMs?: number;
}

type Robots = ReturnType<typeof robotsParser>;

/**
 * HTTP client for scraping: obeys robots.txt (including Crawl-delay), waits a random
 * 2 to 5 seconds between requests to the same host, and raises BlockedError on
 * rate limits or CAPTCHA pages instead of trying to get around them.
 */
export class PoliteFetcher {
  private readonly robots = new Map<string, Promise<Robots | "disallow-all" | null>>();
  private readonly nextAllowed = new Map<string, number>();
  private readonly opts: Required<Omit<PoliteFetcherOptions, "renderer">> & { renderer?: Renderer };
  requests = 0;

  constructor(opts: PoliteFetcherOptions = {}) {
    this.opts = {
      minDelayMs: opts.minDelayMs ?? 2000,
      maxDelayMs: opts.maxDelayMs ?? 5000,
      userAgent: opts.userAgent ?? USER_AGENT,
      fetchImpl: opts.fetchImpl ?? fetch,
      renderer: opts.renderer,
      sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      now: opts.now ?? Date.now,
      random: opts.random ?? Math.random,
      timeoutMs: opts.timeoutMs ?? 30_000,
    };
  }

  async get(url: string, options: { render?: boolean; accept?: string } = {}): Promise<FetchResult> {
    const target = new URL(url);
    const robots = await this.robotsFor(target);
    if (robots === "disallow-all" || (robots && robots.isAllowed(url, BOT_NAME) === false)) {
      throw new RobotsDisallowedError(url);
    }
    const crawlDelayS = robots ? (robots.getCrawlDelay(BOT_NAME) ?? 0) : 0;
    await this.waitTurn(target.host, crawlDelayS * 1000);

    let res: FetchResult;
    if (options.render) {
      if (!this.opts.renderer) throw new Error("Rendering requested but no browser renderer configured");
      res = await this.opts.renderer.render(url, this.opts.userAgent);
    } else {
      res = await this.rawFetch(url, options.accept);
    }
    this.requests++;

    const blocked = looksBlocked(res.status, res.body);
    if (blocked) throw new BlockedError(blocked, url);
    if (res.status >= 400) throw new Error(`HTTP ${res.status} for ${url}`);
    return res;
  }

  private async rawFetch(url: string, accept?: string): Promise<FetchResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs);
    try {
      const res = await this.opts.fetchImpl(url, {
        headers: {
          "User-Agent": this.opts.userAgent,
          Accept: accept ?? "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: ctrl.signal,
      });
      const body = await res.text();
      return { status: res.status, url: res.url || url, body, contentType: res.headers.get("content-type") ?? "" };
    } finally {
      clearTimeout(timer);
    }
  }

  private robotsFor(target: URL): Promise<Robots | "disallow-all" | null> {
    const origin = target.origin;
    let p = this.robots.get(origin);
    if (!p) {
      p = (async () => {
        const robotsUrl = `${origin}/robots.txt`;
        await this.waitTurn(target.host, 0);
        try {
          const res = await this.rawFetch(robotsUrl, "text/plain");
          this.requests++;
          // Per RFC 9309: 4xx means no restrictions, 5xx means assume full disallow.
          if (res.status >= 500) return "disallow-all";
          if (res.status >= 400) return null;
          return robotsParser(robotsUrl, res.body);
        } catch {
          return null;
        }
      })();
      this.robots.set(origin, p);
    }
    return p;
  }

  private async waitTurn(host: string, minimumMs: number): Promise<void> {
    const { minDelayMs, maxDelayMs, random, now, sleep } = this.opts;
    const delay = Math.max(minDelayMs + random() * Math.max(0, maxDelayMs - minDelayMs), minimumMs);
    // Reserve a slot before sleeping so concurrent callers queue behind us.
    const start = Math.max(now(), this.nextAllowed.get(host) ?? 0);
    this.nextAllowed.set(host, start + delay);
    const wait = start - now();
    if (wait > 0) await sleep(wait);
  }
}
