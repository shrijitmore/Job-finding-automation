import { Inject, Injectable } from "@nestjs/common";
import type { ObjectStorage } from "@jfa/core";
import {
  and,
  applications,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  jobs,
  ne,
  or,
  sources,
  sql,
  type Application,
  type Db,
  type Job,
} from "@jfa/db";
import { PdfRenderer, companyKey, hardFilter, matchRole, scoreJob, tailorAndValidate, targetFields, targetRoles, type JobForPrompt } from "@jfa/pipeline";
import type { Field } from "@jfa/shared";
import { CONFIG, type WorkerConfig } from "../config";
import { FetchService } from "../fetch/fetch.service";
import { DB, STORAGE } from "../infra.module";
import { ApplyService } from "./apply.service";
import type { RunContext } from "./run-context";

const CANDIDATE_LOOKBACK_DAYS = 30;

/** text[] && text[] with the values bound as one parameter. */
function overlaps(column: typeof sources.fields | typeof jobs.fields, values: string[]) {
  return values.length ? sql`${column} && string_to_array(${values.join(",")}, ',')` : sql`false`;
}

function jobForPrompt(j: Job): JobForPrompt {
  return { title: j.title, company: j.company, location: j.location, description: j.description, applyEmail: j.applyEmail, ats: j.ats, atsJobId: j.atsJobId };
}

/** The pipeline steps. Each one reads and writes Postgres so a crashed run can resume where it stopped. */
@Injectable()
export class RunSteps {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    @Inject(CONFIG) private readonly config: WorkerConfig,
    private readonly fetchService: FetchService,
    private readonly applyService: ApplyService,
  ) {}

  /** FETCH: scrape every enabled source tagged with one of the profile's fields. */
  async fetch(ctx: RunContext): Promise<{ jobIds: string[]; blocked: string[] }> {
    const fields = targetFields(ctx.profile.preferences);
    if (!fields.length) {
      ctx.log.warn("fetch", "No target roles selected in preferences, nothing to fetch");
      return { jobIds: [], blocked: [] };
    }
    const list = await this.db
      .select()
      .from(sources)
      .where(and(eq(sources.userId, ctx.userId), eq(sources.enabled, true), overlaps(sources.fields, fields)));
    ctx.log.info("fetch", `Scraping ${list.length} sources for ${fields.join(", ")}`);
    const report = await this.fetchService.fetchSources(list, ctx.llm, ctx.log);
    await ctx.log.stats({ fetched: report.jobIds.length, newJobs: report.newJobIds.length });
    for (const s of report.sources.filter((x) => x.status === "error")) await ctx.log.error("fetch", s.error ?? "Source failed", { source: s.name });
    return { jobIds: report.jobIds, blocked: report.blocked };
  }

  /** FILTER: hard filters from preferences before any Claude call. */
  async filter(ctx: RunContext, fetchedIds: string[]): Promise<string[]> {
    const prefs = ctx.profile.preferences;
    const fields = targetFields(prefs);
    const since = new Date(ctx.now.getTime() - CANDIDATE_LOOKBACK_DAYS * 86_400_000);
    // Candidates: jobs found this run plus recent stored jobs in the profile's fields that it hasn't processed yet.
    const candidates = await this.db
      .select()
      .from(jobs)
      .where(
        or(
          fetchedIds.length ? inArray(jobs.id, fetchedIds) : sql`false`,
          and(gte(jobs.lastSeenAt, since), overlaps(jobs.fields, fields)),
        ),
      );
    const seen = await this.db
      .select({ jobId: applications.jobId })
      .from(applications)
      .where(eq(applications.profileId, ctx.profile.id));
    const cooldownSince = new Date(ctx.now.getTime() - ctx.profile.schedule.companyCooldownDays * 86_400_000);
    const recent = await this.db
      .select({ company: jobs.company, at: applications.appliedAt })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(eq(applications.profileId, ctx.profile.id), inArray(applications.status, ["applied", "dry_run", "replied", "interview", "rejected"]), gte(applications.updatedAt, cooldownSince)));
    const recentCompanies = new Map(recent.map((r) => [companyKey(r.company), r.at ?? ctx.now]));

    const { kept, rejected } = hardFilter(candidates, {
      prefs,
      now: ctx.now,
      recentCompanies,
      cooldownDays: ctx.profile.schedule.companyCooldownDays,
      seenJobIds: new Set(seen.map((s) => s.jobId)),
    });
    const reasons = rejected.reduce<Record<string, number>>((acc, r) => {
      const key = r.reason.replace(/".*?"/g, "…");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    ctx.log.info("filter", `${kept.length} of ${candidates.length} jobs passed hard filters`, { reasons });
    await ctx.log.stats({ filtered: kept.length });
    // Newest first, bounded so one run can't spend unbounded tokens.
    return kept
      .sort((a, b) => (b.postedAt ?? b.firstSeenAt).getTime() - (a.postedAt ?? a.firstSeenAt).getTime())
      .slice(0, this.config.MAX_SCORE_PER_RUN)
      .map((j) => j.id);
  }

  /** SCORE: Claude rates each job against the master resume. Every result is stored. */
  async score(ctx: RunContext, jobIds: string[]): Promise<void> {
    if (!jobIds.length) {
      await ctx.log.stats({ scored: 0 });
      return;
    }
    if (!ctx.llm) {
      await ctx.log.error("score", "No Claude API key configured; cannot score jobs");
      return;
    }
    const master = ctx.profile.masterResume!;
    const roles = targetRoles(ctx.profile.preferences);
    const list = await this.db.select().from(jobs).where(inArray(jobs.id, jobIds));
    let scored = 0;
    for (const job of list) {
      try {
        const result = await scoreJob(ctx.llm, { job: jobForPrompt(job), master, skills: ctx.skills, roles });
        const role = roles.find((r) => r.label === result.role_type) ?? matchRole(job.title, roles);
        const field: Field = role?.field ?? result.field;
        const below = result.fit_score < ctx.profile.preferences.minFitScore;
        await this.db
          .insert(applications)
          .values({
            profileId: ctx.profile.id,
            jobId: job.id,
            runId: ctx.run.id,
            status: below ? "skipped" : "scored",
            fitScore: result.fit_score,
            score: result,
            roleType: role?.label ?? result.role_type,
            field,
            applyChannel: result.apply_channel,
            skipReason: below ? `Fit score ${result.fit_score} is below your minimum of ${ctx.profile.preferences.minFitScore}` : null,
          })
          .onConflictDoNothing();
        scored++;
      } catch (err) {
        await ctx.log.error("score", `Scoring failed for ${job.title} at ${job.company}: ${(err as Error).message}`, { jobId: job.id });
      }
    }
    ctx.log.info("score", `Scored ${scored} jobs`);
    await ctx.log.stats({ scored });
  }

  /** Picks the best scored jobs for this run, up to the run cap. Includes leftovers from a crashed attempt. */
  async shortlist(ctx: RunContext): Promise<Application[]> {
    const pending = await this.db
      .select()
      .from(applications)
      .where(and(eq(applications.profileId, ctx.profile.id), eq(applications.runId, ctx.run.id), eq(applications.status, "scored")))
      .orderBy(desc(applications.fitScore));
    const inFlight = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(applications)
      .where(and(eq(applications.runId, ctx.run.id), inArray(applications.status, ["tailored", "ready", "applied", "dry_run", "manual_apply"])));
    const room = Math.max(0, ctx.cap - (inFlight[0]?.n ?? 0));
    const picked = pending.slice(0, room);
    const overflow = pending.slice(room);
    if (overflow.length) {
      await this.db
        .update(applications)
        .set({ status: "skipped", skipReason: "Run cap reached; a higher-scoring job took the slot", updatedAt: new Date() })
        .where(inArray(applications.id, overflow.map((a) => a.id)));
    }
    ctx.log.info("score", `Shortlisted ${picked.length} jobs (run cap ${ctx.cap})`);
    await ctx.log.stats({ shortlisted: picked.length });
    return picked;
  }

  /** TAILOR + VALIDATE: write, render and check a resume and cover note per shortlisted job. */
  async tailor(ctx: RunContext, apps: Application[]): Promise<void> {
    if (!apps.length || !ctx.llm) return;
    const renderer = new PdfRenderer(this.config.CHROMIUM_PATH);
    let tailored = 0;
    let failed = 0;
    try {
      for (const app of apps) {
        const [job] = await this.db.select().from(jobs).where(eq(jobs.id, app.jobId));
        const field = (app.field ?? "engineering") as Field;
        try {
          const out = await tailorAndValidate(ctx.llm, renderer, {
            job: jobForPrompt(job),
            master: ctx.profile.masterResume!,
            skills: ctx.skills,
            style: ctx.profile.styleRules,
            field,
            roleType: app.roleType ?? job.title,
            missingSkills: app.score?.missing_skills ?? [],
          });
          let pdfKey: string | null = null;
          if (out.pdf) {
            pdfKey = `profiles/${ctx.profile.id}/applications/${app.id}/resume.pdf`;
            await this.storage.put(pdfKey, out.pdf, "application/pdf");
          }
          await this.db
            .update(applications)
            .set({
              status: out.ok ? "ready" : "validation_failed",
              tailored: out.tailored,
              coverNote: out.coverNote,
              template: out.doc?.template,
              pdfKey,
              validation: { passed: out.ok, attempts: out.attempts, issues: out.issues, pageCount: out.pageCount },
              skipReason: out.ok ? null : `Failed validation twice: ${out.issues.slice(0, 3).join("; ")}`,
              updatedAt: new Date(),
            })
            .where(eq(applications.id, app.id));
          if (out.ok) tailored++;
          else {
            failed++;
            ctx.log.warn("validate", `Skipped ${job.title} at ${job.company}: ${out.issues.join("; ")}`);
          }
        } catch (err) {
          failed++;
          await this.db
            .update(applications)
            .set({ status: "failed", error: (err as Error).message, updatedAt: new Date() })
            .where(eq(applications.id, app.id));
          await ctx.log.error("tailor", `Tailoring failed for ${job.title} at ${job.company}: ${(err as Error).message}`, { jobId: job.id });
        }
      }
    } finally {
      await renderer.close();
    }
    ctx.log.info("tailor", `Tailored ${tailored}, validation failed ${failed}`);
    await ctx.log.stats({ tailored, validationFailed: failed });
  }

  /** APPLY: send or submit each ready application by channel. In dry run nothing leaves the system. */
  async apply(ctx: RunContext): Promise<void> {
    const ready = await this.db
      .select()
      .from(applications)
      .where(and(eq(applications.runId, ctx.run.id), eq(applications.status, "ready")))
      .orderBy(desc(applications.fitScore));
    await this.applyService.applyAll(ctx, ready);
  }

  /** Counts today's applications (in the profile's time zone) toward the daily cap. */
  async usedToday(profileId: string, since: Date, excludeRunId?: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(applications)
      .where(
        and(
          eq(applications.profileId, profileId),
          inArray(applications.status, ["applied", "dry_run", "manual_apply", "tailored", "ready"]),
          gte(applications.updatedAt, since),
          excludeRunId ? or(isNull(applications.runId), ne(applications.runId, excludeRunId)) : sql`true`,
        ),
      );
    return row?.n ?? 0;
  }
}
