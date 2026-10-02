import type { TestingModule } from "@nestjs/testing";
import { SAMPLE_RESUME, type GmailMessage, type OutgoingMail } from "@jfa/core";
import { applications, createDb, eq, jobs, profiles, replies, users, type Db } from "@jfa/db";
import { DEFAULT_PREFERENCES, DEFAULT_SCHEDULE, DEFAULT_STYLE_RULES } from "@jfa/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAILER_FACTORY, type Mailer } from "../mail/mailer";
import { NOTIFIER_FACTORY } from "../notify/telegram.factory";
import { TEST_DATABASE_URL, createWorker, resetDatabase } from "../test-utils";
import { ATS_SUBMITTER } from "./apply.service";
import { ProfileRunService } from "./profile-run.service";

const msg = (id: string, from: string, text: string, at = Date.now()): GmailMessage => ({
  id,
  threadId: "",
  labelIds: [],
  internalDate: at,
  from,
  to: "me@example.com",
  subject: "Re: Application: Backend Engineer (Jane Doe)",
  messageId: `<${id}@mail>`,
  references: "",
  text,
});

class ThreadMailer implements Mailer {
  address = "me@example.com";
  sent: OutgoingMail[] = [];
  threads = new Map<string, GmailMessage[]>();
  async send(m: OutgoingMail) {
    this.sent.push(m);
    return { id: `sent-${this.sent.length}`, threadId: m.threadId ?? "new" };
  }
  async getThread(id: string) {
    return (this.threads.get(id) ?? []).map((m) => ({ ...m, threadId: id }));
  }
  async markRead() {}
}

describe("reply handler and notifications", () => {
  let worker: TestingModule;
  let svc: ProfileRunService;
  let db: Db;
  let end: () => Promise<void>;
  const mailer = new ThreadMailer();
  const telegram: string[] = [];

  beforeAll(async () => {
    worker = await createWorker(
      {},
      {
        mailerFactory: { provide: MAILER_FACTORY, useValue: { forProfile: async () => mailer } },
        atsSubmitter: { provide: ATS_SUBMITTER, useValue: null },
        notifierFactory: { provide: NOTIFIER_FACTORY, useValue: { forUser: async () => ({ send: async (t: string) => void telegram.push(t) }) } },
      },
    );
    svc = worker.get(ProfileRunService);
    const h = createDb(TEST_DATABASE_URL, { max: 2 });
    db = h.db;
    end = () => h.pool.end();
  });

  afterAll(async () => {
    await worker?.close();
    await end?.();
  });

  beforeEach(async () => {
    await resetDatabase();
    mailer.sent = [];
    mailer.threads.clear();
    telegram.length = 0;
  });

  async function seed(dryRun: boolean) {
    const [user] = await db.insert(users).values({ email: `o${Math.random()}@x.co`, passwordHash: "x" }).returning();
    const [profile] = await db
      .insert(profiles)
      .values({
        userId: user.id,
        name: "Jane",
        masterResume: SAMPLE_RESUME,
        preferences: { ...DEFAULT_PREFERENCES, roleTypeIds: ["engineering:backend-engineer"] },
        schedule: { ...DEFAULT_SCHEDULE, dryRun, timezone: "UTC" },
        styleRules: DEFAULT_STYLE_RULES,
        onboardedAt: new Date(),
      })
      .returning();
    const apps = [];
    for (const [company, thread] of [
      ["Acme", "t-resume"],
      ["Globex", "t-interview"],
      ["Initech", "t-reject"],
      ["Umbrella", "t-portfolio"],
    ] as const) {
      const [job] = await db.insert(jobs).values({ canonicalUrl: `https://x.co/${company}`, dedupeHash: company, title: "Backend Engineer", company, url: `https://x.co/${company}`, applyEmail: `jobs@${company.toLowerCase()}.co` }).returning();
      const [a] = await db
        .insert(applications)
        .values({ profileId: profile.id, jobId: job.id, status: "applied", applyChannel: "email", gmailThreadId: thread, gmailMessageId: `${thread}-0`, appliedAt: new Date() })
        .returning();
      apps.push(a);
    }
    mailer.threads.set("t-resume", [msg("t-resume-0", "me@example.com", "my application"), msg("r1", "Sam <sam@acme.co>", "Thanks! Could you send your resume as a PDF?")]);
    mailer.threads.set("t-interview", [msg("r2", "Ana <ana@globex.co>", "Can we schedule a call on Tuesday at 3pm for an interview?")]);
    mailer.threads.set("t-reject", [msg("r3", "hr@initech.co", "Unfortunately we are not moving forward.")]);
    mailer.threads.set("t-portfolio", [msg("r4", "lee@umbrella.co", "Please share your portfolio and work samples.\n\nOn Mon, Jane wrote:\n> old")]);
    return { profile, apps };
  }

  it("auto-replies only to resume and portfolio requests, flags the rest, and records rejections", async () => {
    const { profile } = await seed(false);
    await svc.execute({ profileId: profile.id, trigger: "manual", idempotencyKey: "r1" });

    const rows = await db.select().from(replies).where(eq(replies.profileId, profile.id));
    const by = Object.fromEntries(rows.map((r) => [r.gmailMessageId, r]));
    expect(by.r1).toMatchObject({ category: "resume_request", status: "auto_replied" });
    expect(by.r4).toMatchObject({ category: "portfolio_request", status: "auto_replied" });
    expect(by.r4.body).not.toContain("old");
    expect(by.r2).toMatchObject({ category: "interview_scheduling", status: "flagged" });
    expect(by.r2.suggestedReply).toBeTruthy();
    expect(by.r3).toMatchObject({ category: "rejection", status: "dismissed" });

    expect(mailer.sent.map((m) => m.to).sort()).toEqual(["lee@umbrella.co", "sam@acme.co"]);
    const portfolio = mailer.sent.find((m) => m.to === "lee@umbrella.co")!;
    expect(portfolio.text).toContain("https://github.com/janedoe");
    expect(portfolio.threadId).toBe("t-portfolio");
    expect(portfolio.inReplyTo).toBe("<r4@mail>");
    // Never agrees to times in an automatic message.
    expect(mailer.sent.some((m) => /tuesday|3pm/i.test(m.text))).toBe(false);

    const statuses = Object.fromEntries((await db.select({ id: applications.gmailThreadId, s: applications.status }).from(applications)).map((r) => [r.id, r.s]));
    expect(statuses).toMatchObject({ "t-interview": "interview", "t-reject": "rejected", "t-resume": "replied" });

    expect(telegram[0]).toContain("needs you");
    expect(telegram[0]).toContain("Globex");
    expect(telegram.at(-1)).toContain("Jane</b> run");

    // Replies are processed once.
    await svc.execute({ profileId: profile.id, trigger: "manual", idempotencyKey: "r2" });
    expect(mailer.sent).toHaveLength(2);
    expect(await db.select().from(replies)).toHaveLength(4);
  });

  it("does not send auto-replies in dry run", async () => {
    const { profile } = await seed(true);
    await svc.execute({ profileId: profile.id, trigger: "manual", idempotencyKey: "d1" });
    expect(mailer.sent).toHaveLength(0);
    const pending = await db.select().from(replies).where(eq(replies.status, "auto_reply_pending"));
    expect(pending).toHaveLength(2);
    expect(telegram.at(-1)).toContain("dry run, nothing sent");
  });
});
