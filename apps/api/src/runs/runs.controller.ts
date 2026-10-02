import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { QUEUES, type PgBoss, type ProfileRunJob } from "@jfa/core";
import { and, asc, desc, eq, runEvents, runs, sql, type Db } from "@jfa/db";
import { CurrentUser, type SessionUser } from "../common/current-user";
import { DB } from "../db/db.module";
import { ProfilesService } from "../profiles/profiles.service";
import { BOSS } from "../queue/queue.module";

@Controller("profiles/:profileId/runs")
export class RunsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(BOSS) private readonly boss: PgBoss,
    private readonly profiles: ProfilesService,
  ) {}

  /** "Run now". Honors the profile's dry run setting. */
  @Post()
  async runNow(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string) {
    const profile = await this.profiles.get(user.id, profileId);
    if (!profile.masterResume) throw new BadRequestException("Save a master resume before running");
    if (!profile.preferences.roleTypeIds.length && !profile.preferences.customRoleTypes.length) {
      throw new BadRequestException("Pick at least one role type in Job preferences");
    }
    const [active] = await this.db
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.profileId, profileId), sql`${runs.status} in ('queued','running')`, sql`${runs.createdAt} > now() - interval '3 hours'`));
    if (active) throw new BadRequestException("A run is already queued or in progress");
    const key = `manual:${new Date().toISOString()}`;
    const data: ProfileRunJob = { profileId, trigger: "manual", idempotencyKey: key };
    await this.db.insert(runs).values({ profileId, trigger: "manual", idempotencyKey: key, dryRun: profile.schedule.dryRun, status: "queued" });
    await this.boss.send(QUEUES.profileRun, data, { singletonKey: `${profileId}:${key}`, retryLimit: 2, retryDelay: 300, expireInSeconds: 3 * 3600 });
    const [run] = await this.db.select().from(runs).where(and(eq(runs.profileId, profileId), eq(runs.idempotencyKey, key)));
    return run;
  }

  @Get()
  async list(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string, @Query("limit") limit?: string) {
    await this.profiles.get(user.id, profileId);
    return this.db
      .select()
      .from(runs)
      .where(eq(runs.profileId, profileId))
      .orderBy(desc(runs.createdAt))
      .limit(Math.min(100, Number(limit) || 30));
  }

  @Get(":runId")
  async get(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string, @Param("runId", ParseUUIDPipe) runId: string) {
    await this.profiles.get(user.id, profileId);
    const [run] = await this.db.select().from(runs).where(and(eq(runs.id, runId), eq(runs.profileId, profileId)));
    if (!run) throw new NotFoundException("Run not found");
    const events = await this.db.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(asc(runEvents.createdAt)).limit(1000);
    return { run, events };
  }
}
