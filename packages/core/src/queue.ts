import { PgBoss } from "pg-boss";

export const QUEUES = {
  /** One agent run for one profile. Data: ProfileRunJob. */
  profileRun: "profile-run",
  /** Cron-triggered tick per profile and run time. Data: ScheduledTickJob. */
  scheduledTick: "scheduled-tick",
  /** Re-syncs pg-boss cron schedules after profile schedule changes. */
  syncSchedules: "sync-schedules",
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

export function createBoss(connectionString: string): PgBoss {
  const ssl = /sslmode=require|neon\.tech|supabase\.co/.test(connectionString) ? { rejectUnauthorized: false } : undefined;
  return new PgBoss({ connectionString, ssl, schema: "pgboss" });
}

export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name);
  }
}

export type { PgBoss };
