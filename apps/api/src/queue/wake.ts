import { Logger } from "@nestjs/common";

/** Fire-and-forget ping so a sleeping worker (e.g. a free Render instance) starts and picks up queued jobs. */
export function wakeWorker(url: string | undefined): void {
  if (!url) return;
  fetch(url, { signal: AbortSignal.timeout(60_000) }).catch((err) => Logger.warn(`Worker wake ping failed: ${(err as Error).message}`, "Queue"));
}
