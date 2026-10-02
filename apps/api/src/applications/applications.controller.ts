import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { ObjectStorage } from "@jfa/core";
import { and, applications, desc, eq, gte, ilike, inArray, jobs, lte, or, replies, runs, sources, sql, type Db } from "@jfa/db";
import { APPLICATION_STATUSES, startOfDayInTz } from "@jfa/shared";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../common/current-user";
import { ZodPipe } from "../common/zod.pipe";
import { DB, STORAGE } from "../db/db.module";
import { ProfilesService } from "../profiles/profiles.service";

const SENT = ["applied", "replied", "interview", "rejected"] as const;

const ListQuery = z.object({
  status: z.string().optional(),
  roleType: z.string().optional(),
  sourceId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const PatchSchema = z.object({
  status: z.enum(["applied", "skipped", "interview", "rejected"]),
});

@Controller("profiles/:profileId")
export class ApplicationsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    private readonly profiles: ProfilesService,
  ) {}

  @Get("dashboard")
  async dashboard(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string) {
    const profile = await this.profiles.get(user.id, profileId);
    const now = new Date();
    const today = startOfDayInTz(now, profile.schedule.timezone);
    const week = new Date(now.getTime() - 7 * 86_400_000);
    const count = async (where: ReturnType<typeof and>) => {
      const [r] = await this.db.select({ n: sql<number>`count(*)::int` }).from(applications).where(where);
      return r?.n ?? 0;
    };
    const mine = eq(applications.profileId, profileId);
    const sentToday = await count(and(mine, inArray(applications.status, [...SENT]), gte(applications.appliedAt, today)));
    const sentWeek = await count(and(mine, inArray(applications.status, [...SENT]), gte(applications.appliedAt, week)));
    const sentAll = await count(and(mine, inArray(applications.status, [...SENT])));
    const dryToday = await count(and(mine, eq(applications.status, "dry_run"), gte(applications.updatedAt, today)));
    const dryWeek = await count(and(mine, eq(applications.status, "dry_run"), gte(applications.updatedAt, week)));
    const manualPending = await count(and(mine, eq(applications.status, "manual_apply")));
    const [responded] = await this.db
      .select({ n: sql<number>`count(distinct ${replies.applicationId})::int` })
      .from(replies)
      .where(and(eq(replies.profileId, profileId), sql`${replies.category} is distinct from 'rejection'`));
    const [interviews] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(replies)
      .where(and(eq(replies.profileId, profileId), eq(replies.category, "interview_scheduling")));
    const [lastRun] = await this.db.select().from(runs).where(eq(runs.profileId, profileId)).orderBy(desc(runs.createdAt)).limit(1);
    const [{ cost }] = await this.db
      .select({ cost: sql<string>`coalesce(sum(${runs.costUsd}), 0)` })
      .from(runs)
      .where(and(eq(runs.profileId, profileId), gte(runs.createdAt, week)));
    return {
      dryRun: profile.schedule.dryRun,
      appliedToday: sentToday,
      appliedWeek: sentWeek,
      dryRunToday: dryToday,
      dryRunWeek: dryWeek,
      responseRate: sentAll ? (responded?.n ?? 0) / sentAll : 0,
      interviews: interviews?.n ?? 0,
      manualPending,
      dailyCap: profile.schedule.dailyCap,
      costWeekUsd: Number(cost),
      lastRun: lastRun ?? null,
    };
  }

  @Get("applications")
  async list(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    await this.profiles.get(user.id, profileId);
    const statuses = q.status?.split(",").filter((s) => (APPLICATION_STATUSES as readonly string[]).includes(s));
    const where = and(
      eq(applications.profileId, profileId),
      statuses?.length ? inArray(applications.status, statuses as never) : undefined,
      q.roleType ? eq(applications.roleType, q.roleType) : undefined,
      q.sourceId ? eq(jobs.sourceId, q.sourceId) : undefined,
      q.from ? gte(applications.updatedAt, new Date(q.from)) : undefined,
      q.to ? lte(applications.updatedAt, new Date(`${q.to}T23:59:59.999Z`)) : undefined,
      q.q ? or(ilike(jobs.title, `%${q.q}%`), ilike(jobs.company, `%${q.q}%`)) : undefined,
    );
    const rows = await this.db
      .select({
        id: applications.id,
        status: applications.status,
        fitScore: applications.fitScore,
        roleType: applications.roleType,
        field: applications.field,
        applyChannel: applications.applyChannel,
        applyTarget: applications.applyTarget,
        skipReason: applications.skipReason,
        appliedAt: applications.appliedAt,
        updatedAt: applications.updatedAt,
        hasPdf: sql<boolean>`${applications.pdfKey} is not null`,
        job: { id: jobs.id, title: jobs.title, company: jobs.company, location: jobs.location, url: jobs.url, postedAt: jobs.postedAt },
        source: { id: sources.id, name: sources.name },
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(sources, eq(sources.id, jobs.sourceId))
      .where(where)
      .orderBy(desc(applications.updatedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(where);
    const roleTypes = await this.db
      .selectDistinct({ roleType: applications.roleType })
      .from(applications)
      .where(eq(applications.profileId, profileId));
    return { items: rows, total, page: q.page, pageSize: q.pageSize, roleTypes: roleTypes.map((r) => r.roleType).filter(Boolean) };
  }

  private async load(userId: string, profileId: string, appId: string) {
    await this.profiles.get(userId, profileId);
    const [row] = await this.db
      .select()
      .from(applications)
      .where(and(eq(applications.id, appId), eq(applications.profileId, profileId)));
    if (!row) throw new NotFoundException("Application not found");
    return row;
  }

  @Get("applications/:appId")
  async detail(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string, @Param("appId", ParseUUIDPipe) appId: string) {
    const app = await this.load(user.id, profileId, appId);
    const [job] = await this.db.select().from(jobs).where(eq(jobs.id, app.jobId));
    const [source] = job.sourceId ? await this.db.select({ id: sources.id, name: sources.name }).from(sources).where(eq(sources.id, job.sourceId)) : [];
    const thread = await this.db.select().from(replies).where(eq(replies.applicationId, appId)).orderBy(desc(replies.receivedAt));
    const { pdfKey, screenshotKey, ...rest } = app;
    return { ...rest, hasPdf: Boolean(pdfKey), hasScreenshot: Boolean(screenshotKey), job, source: source ?? null, replies: thread };
  }

  @Patch("applications/:appId")
  async patch(
    @CurrentUser() user: SessionUser,
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Param("appId", ParseUUIDPipe) appId: string,
    @Body(new ZodPipe(PatchSchema)) body: z.infer<typeof PatchSchema>,
  ) {
    const app = await this.load(user.id, profileId, appId);
    const [row] = await this.db
      .update(applications)
      .set({ status: body.status, appliedAt: body.status === "applied" ? (app.appliedAt ?? new Date()) : app.appliedAt, updatedAt: new Date() })
      .where(eq(applications.id, appId))
      .returning();
    return row;
  }

  @Get("applications/:appId/pdf")
  async pdf(
    @CurrentUser() user: SessionUser,
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Param("appId", ParseUUIDPipe) appId: string,
    @Query("download") download: string | undefined,
    @Res() res: Response,
  ) {
    const app = await this.load(user.id, profileId, appId);
    if (!app.pdfKey) throw new NotFoundException("No resume generated for this application");
    const body = await this.storage.get(app.pdfKey);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="resume-${appId.slice(0, 8)}.pdf"`);
    res.send(body);
  }

  @Get("applications/:appId/screenshot")
  async screenshot(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string, @Param("appId", ParseUUIDPipe) appId: string, @Res() res: Response) {
    const app = await this.load(user.id, profileId, appId);
    if (!app.screenshotKey) throw new NotFoundException("No screenshot for this application");
    res.setHeader("Content-Type", "image/png");
    res.send(await this.storage.get(app.screenshotKey));
  }
}
