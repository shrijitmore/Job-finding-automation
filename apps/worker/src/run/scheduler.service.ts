import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { QUEUES, type PgBoss, type ProfileRunJob, type ScheduledTickJob } from "@jfa/core";
import { eq, profiles, type Db } from "@jfa/db";
import { cronForTime, dateInTz } from "@jfa/shared";
import { CONFIG, type WorkerConfig } from "../config";
import { BOSS, DB } from "../infra.module";
import { ProfileRunService, RunBusyError } from "./profile-run.service";

/**
 * pg-boss cron: one schedule per profile and run time, in the profile's time zone.
 * Each tick enqueues a profile run whose idempotency key is the local date and time,
 * so a duplicate tick or a retried job resumes the same run instead of starting a new one.
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @Inject(BOSS) private readonly boss: PgBoss,
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: WorkerConfig,
    private readonly runner: ProfileRunService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.boss.work<ProfileRunJob>(QUEUES.profileRun, { localConcurrency: this.config.WORKER_CONCURRENCY }, async ([job]) => {
      try {
        await this.runner.execute(job.data);
      } catch (err) {
        if (err instanceof RunBusyError) this.logger.warn(err.message);
        throw err;
      }
    });
    await this.boss.work<ScheduledTickJob>(QUEUES.scheduledTick, async ([job]) => this.tick(job.data));
    await this.boss.work(QUEUES.syncSchedules, async () => this.syncAll());
    await this.syncAll();
  }

  async tick({ profileId, runTime }: ScheduledTickJob, now = new Date()): Promise<string | null> {
    const [profile] = await this.db.select().from(profiles).where(eq(profiles.id, profileId));
    if (!profile || !profile.schedule.enabled) return null;
    const key = `sched:${dateInTz(now, profile.schedule.timezone)}:${runTime}`;
    const data: ProfileRunJob = { profileId, trigger: "schedule", idempotencyKey: key };
    return this.boss.send(QUEUES.profileRun, data, {
      singletonKey: `${profileId}:${key}`,
      retryLimit: 3,
      retryDelay: 600,
      retryBackoff: true,
      expireInSeconds: 3 * 3600,
    });
  }

  /** Makes pg-boss schedules match every profile's settings. */
  async syncAll(): Promise<void> {
    const all = await this.db.select().from(profiles);
    const wanted = new Map<string, { cron: string; tz: string; data: ScheduledTickJob }>();
    for (const p of all) {
      if (!p.schedule.enabled || !p.onboardedAt) continue;
      for (const t of new Set(p.schedule.runTimes)) {
        wanted.set(`${p.id}:${t}`, { cron: cronForTime(t), tz: p.schedule.timezone, data: { profileId: p.id, runTime: t } });
      }
    }
    const existing = await this.boss.getSchedules(QUEUES.scheduledTick);
    for (const s of existing) {
      const w = wanted.get(s.key);
      if (!w || w.cron !== s.cron || w.tz !== s.timezone) await this.boss.unschedule(QUEUES.scheduledTick, s.key);
    }
    for (const [key, w] of wanted) {
      const cur = existing.find((s) => s.key === key);
      if (cur && cur.cron === w.cron && cur.timezone === w.tz) continue;
      await this.boss.schedule(QUEUES.scheduledTick, w.cron, w.data, { tz: w.tz, key });
    }
    this.logger.log(`Schedules synced: ${wanted.size} active`);
  }
}
