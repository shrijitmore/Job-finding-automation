import type { INestApplication } from "@nestjs/common";
import { applications, createDb, jobs, replies } from "@jfa/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, createTestApp, ownerAgent, resetDatabase } from "../test-utils";

describe("inbox and telegram settings", () => {
  let app: INestApplication;
  const h = createDb(TEST_DATABASE_URL, { max: 2 });

  beforeEach(async () => {
    await resetDatabase();
    app ??= await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
    await h.pool.end();
  });

  it("lists replies by category, dismisses, and refuses to send without Gmail", async () => {
    const agent = await ownerAgent(app);
    const { body: p } = await agent.post("/api/profiles").send({ name: "Me" });
    const [job] = await h.db.insert(jobs).values({ canonicalUrl: "https://a.co/1", dedupeHash: "h", title: "Designer", company: "Acme", url: "https://a.co/1" }).returning();
    const [a] = await h.db.insert(applications).values({ profileId: p.id, jobId: job.id, status: "interview" }).returning();
    const base = { profileId: p.id, applicationId: a.id, gmailThreadId: "t", fromAddress: "ana@acme.co", subject: "Interview", body: "When are you free?", receivedAt: new Date() };
    const [r1] = await h.db.insert(replies).values({ ...base, gmailMessageId: "m1", category: "interview_scheduling", status: "flagged", suggestedReply: "Thanks, I will confirm my availability." }).returning();
    await h.db.insert(replies).values({ ...base, gmailMessageId: "m2", category: "rejection", status: "dismissed" });

    const all = await agent.get(`/api/profiles/${p.id}/replies`).expect(200);
    expect(all.body).toHaveLength(2);
    const flagged = await agent.get(`/api/profiles/${p.id}/replies?category=interview_scheduling`).expect(200);
    expect(flagged.body).toHaveLength(1);
    expect(flagged.body[0]).toMatchObject({ job: { company: "Acme" }, suggestedReply: "Thanks, I will confirm my availability." });

    const send = await agent.post(`/api/profiles/${p.id}/replies/${r1.id}/send`).send({ body: "Thanks!" }).expect(400);
    expect(send.body.message).toMatch(/Connect Gmail/);
    const dismissed = await agent.patch(`/api/profiles/${p.id}/replies/${r1.id}`).send({ status: "dismissed" }).expect(200);
    expect(dismissed.body.status).toBe("dismissed");
  });

  it("validates and stores Telegram settings encrypted", async () => {
    const agent = await ownerAgent(app);
    await agent.put("/api/settings/telegram").send({ botToken: "nope", chatId: "123" }).expect(400);
    const ok = await agent.put("/api/settings/telegram").send({ botToken: "123456789:ABCdefGhIJKlmNoPQRstuVWXyz_12345", chatId: "-100123" }).expect(200);
    expect(ok.body).toEqual({ configured: true, chatId: "-100123", botToken: "****2345" });
    const s = await agent.get("/api/settings").expect(200);
    expect(JSON.stringify(s.body)).not.toContain("ABCdef");
    await agent.delete("/api/settings/telegram").expect(200);
    await agent.post("/api/settings/telegram/test").expect(400);
  });
});
