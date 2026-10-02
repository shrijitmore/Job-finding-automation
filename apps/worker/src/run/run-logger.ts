import { Logger } from "@nestjs/common";
import { eq, runEvents, runs, sql, type Db, type RunError } from "@jfa/db";
import type { EventLogger } from "../fetch/fetch.service";

/** Writes run events and step timings to Postgres so the Run logs page can show them. */
export class RunLogger implements EventLogger {
  private readonly logger = new Logger("Run");

  constructor(
    private readonly db: Db,
    readonly runId: string,
  ) {}

  private write(level: "info" | "warn" | "error", step: string, message: string, data?: Record<string, unknown>) {
    this.logger[level === "info" ? "log" : level](`[${this.runId.slice(0, 8)}] ${step}: ${message}`);
    void this.db.insert(runEvents).values({ runId: this.runId, level, step, message, data }).catch(() => undefined);
  }

  info(step: string, message: string, data?: Record<string, unknown>) {
    this.write("info", step, message, data);
  }

  warn(step: string, message: string, data?: Record<string, unknown>) {
    this.write("warn", step, message, data);
  }

  async error(step: string, message: string, extra: Partial<RunError> = {}) {
    this.write("error", step, message, extra as Record<string, unknown>);
    const err: RunError = { step, message, ...extra };
    await this.db
      .update(runs)
      .set({ errors: sql`${runs.errors} || ${JSON.stringify([err])}::jsonb` })
      .where(eq(runs.id, this.runId));
  }

  /** Times a step and stores its duration under run.timings[step]. */
  async time<T>(step: string, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try {
      return await fn();
    } finally {
      const ms = Date.now() - started;
      await this.db
        .update(runs)
        .set({ timings: sql`${runs.timings} || ${JSON.stringify({ [step]: ms })}::jsonb` })
        .where(eq(runs.id, this.runId));
    }
  }

  async stats(patch: Record<string, number>) {
    await this.db
      .update(runs)
      .set({ stats: sql`${runs.stats} || ${JSON.stringify(patch)}::jsonb` })
      .where(eq(runs.id, this.runId));
  }
}
