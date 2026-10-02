import type { TestingModule } from "@nestjs/testing";
import { SAMPLE_RESUME, type OutgoingMail } from "@jfa/core";
import { applications, createDb, eq, profileSkills, profiles, runEvents, runs, sources, tokenUsage, users, type Db } from "@jfa/db";
import { DEFAULT_PREFERENCES, DEFAULT_SCHEDULE, DEFAULT_STYLE_RULES } from "@jfa/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAILER_FACTORY, type Mailer } from "../mail/mailer";
import { TEST_DATABASE_URL, createWorker, fixtureServer, resetDatabase } from "../test-utils";
import { ProfileRunService } from "./profile-run.service";

const now = new Date();
const item = (title: string, company: string, desc: string, link: string) => `<item>
  <title>${company}: ${title}</title>
  <region>Anywhere in the World</region>
  <link>${link}</link>
  <pubDate>${now.toUTCString()}</pubDate>
  <description>${desc.replace(/</g, "&lt;")}</description>
</item>`;

function feed(base: string) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>
${item("Senior Backend Engineer", "Ledgerly", "Build TypeScript, Node.js, PostgreSQL and GraphQL services. 4+ years of experience. Email jobs@ledgerly.io to apply with your resume.", `${base}/jobs/ledgerly`)}
${item("Backend Engineer", "Payflow", "TypeScript, Node.js, Redis and PostgreSQL. Apply at https://job-boards.greenhouse.io/payflow/jobs/123", "https://job-boards.greenhouse.io/payflow/jobs/123")}
${item("Backend Developer", "Shopkit", "Node.js, PostgreSQL, GraphQL and React on our careers site.", `${base}/jobs/shopkit`)}
${item("Backend Engineer", "Tiny", "PHP only.", `${base}/jobs/tiny`)}
${item("Account Executive", "Salesy", "Sell software.", `${base}/jobs/salesy`)}
</channel></rss>`;
}

class FakeMailer implements Mailer {
  address = "me@example.com";
  sent: OutgoingMail[] = [];
  async send(m: OutgoingMail) {
    this.sent.push(m);
    return { id: `msg-${this.sent.length}`, threadId: `thread-${this.sent.length}` };
  }
  async getThread() {
    return [];
  }
  async markRead() {}
}

describe("profile run (LangGraph pipeline)", () => {
  let worker: TestingModule;
  let svc: ProfileRunService;
  let db: Db;
  let end: () => Promise<void>;
  let server: Awaited<ReturnType<typeof fixtureServer>>;
  const mailer = new FakeMailer();

  beforeAll(async () => {
    worker = await createWorker({}, { mailerFactory: { provide: MAILER_FACTORY, useValue: { forProfile: async () => mailer } } });
    svc = worker.get(ProfileRunService);
    const h = createDb(TEST_DATABASE_URL, { max: 2 });
    db = h.db;
    end = () => h.pool.end();
    server = await fixtureServer({});
  });

  afterAll(async () => {
    await server?.close();
    await worker?.close();
    await end?.();
  });

  beforeEach(async () => {
    await resetDatabase();
    mailer.sent = [];
  });

  async function setup(opts: { dryRun: boolean; dailyCap?: number }) {
    const srv = await fixtureServer({ "/feed.rss": { body: feed("http://127.0.0.1"), type: "application/rss+xml" } });
    const [user] = await db.insert(users).values({ email: `o${Math.random()}@x.co`, passwordHash: "x" }).returning();
    const [profile] = await db
      .insert(profiles)
      .values({
        userId: user.id,
        name: "Jane",
        masterResume: SAMPLE_RESUME,
        preferences: { ...DEFAULT_PREFERENCES, roleTypeIds: ["engineering:backend-engineer"], minFitScore: 70 },
        schedule: { ...DEFAULT_SCHEDULE, dryRun: opts.dryRun, dailyCap: opts.dailyCap ?? 15, timezone: "UTC" },
        styleRules: DEFAULT_STYLE_RULES,
        onboardedAt: new Date(),
      })
      .returning();
    await db.insert(profileSkills).values(SAMPLE_RESUME.skills.map((name) => ({ profileId: profile.id, name, tier: "core" as const })));
    await db.insert(sources).values({ userId: user.id, name: "Feed", plugin: "rss", url: `${srv.base}/feed.rss`, fields: ["engineering"] });
    return { profile, close: srv.close };
  }

  it("runs the full pipeline in dry run without sending anything", async () => {
    const { profile, close } = await setup({ dryRun: true });
    try {
      const run = await svc.execute({ profileId: profile.id, trigger: "manual", idempotencyKey: "t1" });
      expect(run?.status).toBe("succeeded");
      expect(run?.dryRun).toBe(true);
      const apps = await db.select().from(applications).where(eq(applications.profileId, profile.id));
      const byCompany = Object.fromEntries(
        await Promise.all(apps.map(async (a) => [(await db.query.jobs.findFirst({ where: (j, { eq: e }) => e(j.id, a.jobId) }))!.company, a])),
      );
      expect(Object.keys(byCompany).sort()).toEqual(["Ledgerly", "Payflow", "Shopkit", "Tiny"]);
      expect(byCompany.Ledgerly).toMatchObject({ status: "dry_run", applyChannel: "email", applyTarget: "jobs@ledgerly.io" });
      expect(byCompany.Payflow).toMatchObject({ status: "dry_run", applyChannel: "greenhouse" });
      expect(byCompany.Shopkit).toMatchObject({ status: "manual_apply", applyChannel: "manual" });
      expect(byCompany.Tiny).toMatchObject({ status: "skipped" });
      expect(byCompany.Tiny.skipReason).toMatch(/below your minimum/);
      expect(byCompany.Ledgerly.pdfKey).toMatch(/resume\.pdf$/);
      expect(byCompany.Ledgerly.validation).toMatchObject({ passed: true, attempts: 1, pageCount: 1 });
      expect(byCompany.Ledgerly.coverNote).toContain("Ledgerly");
      expect(mailer.sent).toHaveLength(0);

      expect(run!.stats).toMatchObject({ fetched: 5, newJobs: 5, filtered: 4, scored: 4, shortlisted: 3, tailored: 3, dryRun: 2, manual: 1 });
      expect(Object.keys(run!.timings)).toEqual(expect.arrayContaining(["replies", "fetch", "filter", "score", "tailor", "apply", "notify"]));
      const usage = await db.select().from(tokenUsage).where(eq(tokenUsage.runId, run!.id));
      expect(usage.map((u) => u.purpose)).toEqual(expect.arrayContaining(["score", "tailor", "validate"]));
      expect(run!.inputTokens).toBeGreaterThan(0);
      const events = await db.select().from(runEvents).where(eq(runEvents.runId, run!.id));
      expect(events.some((e) => e.message.includes("[dry run] Would apply"))).toBe(true);

      // Same idempotency key: nothing happens again.
      const again = await svc.execute({ profileId: profile.id, trigger: "manual", idempotencyKey: "t1" });
      expect(again?.id).toBe(run?.id);
      expect(await db.select().from(applications).where(eq(applications.profileId, profile.id))).toHaveLength(4);
    } finally {
      await close();
    }
  });

  it("sends email applications in live mode exactly once, even when retried after a crash", async () => {
    const { profile, close } = await setup({ dryRun: false });
    try {
      const run = await svc.execute({ profileId: profile.id, trigger: "manual", idempotencyKey: "live" });
      expect(mailer.sent).toHaveLength(1);
      const mail = mailer.sent[0];
      expect(mail.to).toBe("jobs@ledgerly.io");
      expect(mail.subject).toBe("Application: Senior Backend Engineer (Jane Doe)");
      expect(mail.attachments?.[0]).toMatchObject({ filename: "Jane_Doe_Resume.pdf", contentType: "application/pdf" });
      expect(mail.text).not.toMatch(/[–—]/);
      const [sent] = await db.select().from(applications).where(eq(applications.applyTarget, "jobs@ledgerly.io"));
      expect(sent).toMatchObject({ status: "applied", gmailThreadId: "thread-1" });
      // ATS form filling is not enabled in this phase, so Greenhouse falls back to manual.
      expect(run!.stats).toMatchObject({ applied: 1, manual: 2 });

      // Simulate a crash mid-submit on a retried run: the claimed application is never re-sent.
      await db.update(applications).set({ status: "ready" }).where(eq(applications.id, sent.id));
      await db.update(runs).set({ status: "failed" }).where(eq(runs.id, run!.id));
      await svc.execute({ profileId: profile.id, trigger: "manual", idempotencyKey: "live" });
      expect(mailer.sent).toHaveLength(1);
      const [after] = await db.select().from(applications).where(eq(applications.id, sent.id));
      expect(after.status).toBe("failed");
      expect(after.error).toMatch(/interrupted/);
    } finally {
      await close();
    }
  });

  it("respects the run cap and the company cooldown", async () => {
    const { profile, close } = await setup({ dryRun: true, dailyCap: 2 });
    try {
      const run = await svc.execute({ profileId: profile.id, trigger: "manual", idempotencyKey: "cap" });
      // dailyCap 2 split across 2 run times = 1 per run.
      expect(run!.applyCap).toBe(1);
      expect(run!.stats).toMatchObject({ shortlisted: 1 });
      const skipped = await db.select().from(applications).where(eq(applications.skipReason, "Run cap reached; a higher-scoring job took the slot"));
      expect(skipped).toHaveLength(2);

      // Second run the same day: cap left is 1; already-processed jobs are not re-scored.
      const second = await svc.execute({ profileId: profile.id, trigger: "manual", idempotencyKey: "cap-2" });
      expect(second!.applyCap).toBe(1);
      expect(second!.stats).toMatchObject({ scored: 0 });
      const third = await svc.execute({ profileId: profile.id, trigger: "manual", idempotencyKey: "cap-3" });
      expect(third!.applyCap).toBe(1);
    } finally {
      await close();
    }
  });

  it("fails clearly when the profile has no resume", async () => {
    const { profile, close } = await setup({ dryRun: true });
    try {
      await db.update(profiles).set({ masterResume: null }).where(eq(profiles.id, profile.id));
      const run = await svc.execute({ profileId: profile.id, trigger: "manual", idempotencyKey: "nores" });
      expect(run?.status).toBe("failed");
      expect(run?.errors[0].message).toMatch(/master resume/);
    } finally {
      await close();
    }
  });
});
