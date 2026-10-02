import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ProfileRunJob } from "@jfa/core";
import { and, applications, eq, inArray, profileSkills, profiles, runs, sql, type Db, type Run } from "@jfa/db";
import { runCap, startOfDayInTz } from "@jfa/shared";
import { DB } from "../infra.module";
import { LlmFactory } from "../llm/llm.factory";
import { MAILER_FACTORY, type MailerFactory } from "../mail/mailer";
import { buildRunGraph } from "./graph";
import { NotifyService } from "./notify.service";
import { ReplyService } from "./reply.service";
import { RunLogger } from "./run-logger";
import { toSkills, type RunContext } from "./run-context";
import { RunSteps } from "./steps.service";

export class RunBusyError extends Error {}

@Injectable()
export class ProfileRunService {
  private readonly logger = new Logger(ProfileRunService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MAILER_FACTORY) private readonly mailers: MailerFactory,
    private readonly llmFactory: LlmFactory,
    private readonly steps: RunSteps,
    private readonly replies: ReplyService,
    private readonly notify: NotifyService,
  ) {}

  /** Creates the run row, or returns the existing one for this idempotency key. */
  private async upsertRun(job: ProfileRunJob, dryRun: boolean): Promise<Run> {
    await this.db
      .insert(runs)
      .values({ profileId: job.profileId, trigger: job.trigger, idempotencyKey: job.idempotencyKey, dryRun, status: "queued" })
      .onConflictDoNothing();
    const [run] = await this.db
      .select()
      .from(runs)
      .where(and(eq(runs.profileId, job.profileId), eq(runs.idempotencyKey, job.idempotencyKey)));
    return run;
  }

  async execute(job: ProfileRunJob, now = new Date()): Promise<Run | null> {
    const [profile] = await this.db.select().from(profiles).where(eq(profiles.id, job.profileId));
    if (!profile) return null;
    const run = await this.upsertRun(job, profile.schedule.dryRun);
    if (run.status === "succeeded" || run.status === "partial") {
      this.logger.log(`Run ${run.id} already finished; nothing to do`);
      return run;
    }
    // One active run per profile at a time.
    const [busy] = await this.db
      .select({ id: runs.id })
      .from(runs)
      .where(
        and(
          eq(runs.profileId, profile.id),
          eq(runs.status, "running"),
          sql`${runs.id} <> ${run.id}`,
          sql`${runs.startedAt} > now() - interval '3 hours'`,
        ),
      );
    if (busy) throw new RunBusyError(`Profile ${profile.name} already has a run in progress`);

    const log = new RunLogger(this.db, run.id);
    if (!profile.masterResume) {
      await this.finish(run.id, "failed");
      await log.error("start", "Profile has no saved master resume");
      return this.reload(run.id);
    }

    await this.db
      .update(runs)
      .set({ status: "running", startedAt: run.startedAt ?? now })
      .where(eq(runs.id, run.id));
    log.info("start", `${run.startedAt ? "Resuming" : "Starting"} ${job.trigger} run for ${profile.name}${run.dryRun ? " (dry run)" : ""}`);

    const userId = profile.userId;
    const skills = toSkills(await this.db.select().from(profileSkills).where(eq(profileSkills.profileId, profile.id)));
    const used = await this.steps.usedToday(profile.id, startOfDayInTz(now, profile.schedule.timezone), run.id);
    const cap = runCap(profile.schedule.dailyCap, profile.schedule.runTimes.length, used);
    await this.db.update(runs).set({ applyCap: cap }).where(eq(runs.id, run.id));

    const ctx: RunContext = {
      run: { ...run, status: "running" },
      profile,
      userId,
      skills,
      llm: await this.llmFactory.create({ userId, profileId: profile.id, runId: run.id }),
      mailer: await this.mailers.forProfile(profile.id).catch(() => null),
      log,
      now,
      cap,
    };
    if (!ctx.llm) await log.error("start", "No Claude API key: add one in Settings. Fetching still runs; scoring is skipped.");

    try {
      const graph = buildRunGraph(ctx, {
        replies: (c) => this.replies.handle(c),
        fetch: (c) => this.steps.fetch(c),
        filter: (c, ids) => this.steps.filter(c, ids),
        score: (c, ids) => this.steps.score(c, ids),
        shortlist: (c) => this.steps.shortlist(c),
        tailor: (c, apps) => this.steps.tailor(c, apps),
        apply: (c) => this.steps.apply(c),
        notify: (c, s) => this.notify.send(c, s),
      });
      const final = await graph.invoke({});
      await this.db.update(runs).set({ blockedSources: final.blocked }).where(eq(runs.id, run.id));
      const fresh = await this.reload(run.id);
      await this.finish(run.id, fresh.errors.length ? "partial" : "succeeded");
      log.info("done", `Run finished with ${fresh.errors.length} errors`);
    } catch (err) {
      await log.error("run", `Run crashed: ${(err as Error).message}`);
      await this.finish(run.id, "failed");
      throw err;
    }
    return this.reload(run.id);
  }

  private async finish(runId: string, status: Run["status"]) {
    await this.db.update(runs).set({ status, finishedAt: new Date() }).where(eq(runs.id, runId));
  }

  private async reload(runId: string): Promise<Run> {
    const [r] = await this.db.select().from(runs).where(eq(runs.id, runId));
    return r;
  }

  /** Tally of application outcomes for a run, used by notifications and the dashboard. */
  async outcomes(runId: string) {
    return this.db
      .select({ status: applications.status, n: sql<number>`count(*)::int` })
      .from(applications)
      .where(and(eq(applications.runId, runId), inArray(applications.status, ["applied", "dry_run", "manual_apply", "skipped", "validation_failed", "failed"])))
      .groupBy(applications.status);
  }
}
