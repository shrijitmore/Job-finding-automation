import { PgBoss } from "pg-boss";

export const QUEUES = {
  /** One agent run for one profile. Data: ProfileRunJob. */
  profileRun: "profile-run",
  /** Cron-triggered tick per profile and run time. Data: ScheduledTickJob. */
  scheduledTick: "scheduled-tick",
  /** Re-syncs pg-boss cron schedules after profile schedule changes. */
  syncSchedules: "sync-schedules",
  /** Scrapes one source on demand from the Sources page. Data: SourceScanJob. */
  sourceScan: "source-scan",
} as const;

export interface ProfileRunJob {
  profileId: string;
  trigger: "schedule" | "manual";
  /** Stable key per slot so a retried job resumes the same run instead of starting a new one. */
  idempotencyKey: string;
}

export interface ScheduledTickJob {
  profileId: string;
  runTime: string;
}

export interface SourceScanJob {
  sourceId: string;
}

/**
 * Creates a pg-boss client. The API passes `{ schedule: false, supervise: false }` so only
 * the worker runs cron and maintenance; the API just sends jobs.
 */
export function createBoss(connectionString: string, opts: { schedule?: boolean; supervise?: boolean } = {}): PgBoss {
  const ssl = /sslmode=require|neon\.tech|supabase\.co/.test(connectionString) ? { rejectUnauthorized: false } : undefined;
  return new PgBoss({ connectionString, ssl, schema: "pgboss", ...opts });
}

export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name);
  }
}

export type { PgBoss };
