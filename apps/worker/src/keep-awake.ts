import { Logger } from "@nestjs/common";

/**
 * Hosts with free tiers (Render, Railway) put a web service to sleep after ~15 minutes without
 * inbound HTTP, killing any job in flight. While at least one job runs, ping our own public URL
 * so the host sees traffic. Idle workers still sleep; the API wakes them when work is queued.
 */
export class KeepAwake {
  private busy = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly logger = new Logger(KeepAwake.name);

  constructor(
    private readonly url: string | undefined,
    private readonly intervalMs = 4 * 60_000,
    private readonly ping: (url: string) => Promise<unknown> = (u) => fetch(u, { signal: AbortSignal.timeout(30_000) }),
  ) {}

  get active(): boolean {
    return this.timer !== null;
  }

  async during<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy++ === 0 && this.url) {
      const url = this.url;
      this.timer = setInterval(() => void this.ping(url).catch((e) => this.logger.warn(`Keep-awake ping failed: ${(e as Error).message}`)), this.intervalMs);
      this.timer.unref();
    }
    try {
      return await fn();
    } finally {
      if (--this.busy === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }
  }
}
