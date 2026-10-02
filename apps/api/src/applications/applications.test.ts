import type { INestApplication } from "@nestjs/common";
import { SAMPLE_RESUME } from "@jfa/core";
import { DEFAULT_PREFERENCES } from "@jfa/shared";
import { applications, createDb, jobs, runs } from "@jfa/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, createTestApp, ownerAgent, resetDatabase } from "../test-utils";

describe("runs, dashboard and applications", () => {
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

  async function profileWithResume(agent: Awaited<ReturnType<typeof ownerAgent>>) {
    const { body: p } = await agent.post("/api/profiles").send({ name: "Me" });
    return p as { id: string };
  }

  it("Run now validates setup, queues one run at a time", async () => {
    const agent = await ownerAgent(app);
    const p = await profileWithResume(agent);
    await agent.post(`/api/profiles/${p.id}/runs`).expect(400);
    await agent.patch(`/api/profiles/${p.id}`).send({ masterResume: SAMPLE_RESUME, preferences: { ...DEFAULT_PREFERENCES, roleTypeIds: ["engineering:backend-engineer"] } });
    const run = await agent.post(`/api/profiles/${p.id}/runs`).expect(201);
    expect(run.body).toMatchObject({ status: "queued", trigger: "manual", dryRun: true });
    await agent.post(`/api/profiles/${p.id}/runs`).expect(400);
    const list = await agent.get(`/api/profiles/${p.id}/runs`).expect(200);
    expect(list.body).toHaveLength(1);
    const detail = await agent.get(`/api/profiles/${p.id}/runs/${run.body.id}`).expect(200);
    expect(detail.body.events).toEqual([]);
  });

  it("lists, filters and shows applications with stats", async () => {
    const agent = await ownerAgent(app);
    const p = await profileWithResume(agent);
    const [job] = await h.db.insert(jobs).values({ canonicalUrl: "https://a.co/1", dedupeHash: "h1", title: "Backend Engineer", company: "Acme", url: "https://a.co/1", description: "JD text" }).returning();
    const [job2] = await h.db.insert(jobs).values({ canonicalUrl: "https://a.co/2", dedupeHash: "h2", title: "Video Editor", company: "Brightside", url: "https://a.co/2" }).returning();
    const [r] = await h.db.insert(runs).values({ profileId: p.id, trigger: "manual", idempotencyKey: "k", dryRun: false, status: "succeeded", costUsd: "0.1234" }).returning();
    const [a1] = await h.db
      .insert(applications)
      .values({ profileId: p.id, jobId: job.id, runId: r.id, status: "applied", fitScore: 88, roleType: "Backend Engineer", applyChannel: "email", appliedAt: new Date() })
      .returning();
    await h.db.insert(applications).values({ profileId: p.id, jobId: job2.id, runId: r.id, status: "manual_apply", fitScore: 75, roleType: "Video Editor", applyChannel: "manual" });

    const stats = await agent.get(`/api/profiles/${p.id}/dashboard`).expect(200);
    expect(stats.body).toMatchObject({ appliedToday: 1, appliedWeek: 1, manualPending: 1, dryRun: true, costWeekUsd: 0.1234 });
    expect(stats.body.lastRun.id).toBe(r.id);

    const all = await agent.get(`/api/profiles/${p.id}/applications`).expect(200);
    expect(all.body.total).toBe(2);
    expect(all.body.roleTypes.sort()).toEqual(["Backend Engineer", "Video Editor"]);
    const filtered = await agent.get(`/api/profiles/${p.id}/applications?status=manual_apply`).expect(200);
    expect(filtered.body.items.map((i: { job: { company: string } }) => i.job.company)).toEqual(["Brightside"]);
    const search = await agent.get(`/api/profiles/${p.id}/applications?q=acme`).expect(200);
    expect(search.body.total).toBe(1);

    const detail = await agent.get(`/api/profiles/${p.id}/applications/${a1.id}`).expect(200);
    expect(detail.body).toMatchObject({ status: "applied", hasPdf: false, job: { description: "JD text" } });
    await agent.get(`/api/profiles/${p.id}/applications/${a1.id}/pdf`).expect(404);

    const marked = await agent.patch(`/api/profiles/${p.id}/applications/${a1.id}`).send({ status: "interview" }).expect(200);
    expect(marked.body.status).toBe("interview");
  });

  it("explains Gmail setup when OAuth is not configured", async () => {
    const agent = await ownerAgent(app);
    const p = await profileWithResume(agent);
    const s = await agent.get(`/api/profiles/${p.id}/gmail`).expect(200);
    expect(s.body).toEqual({ serverConfigured: false, connected: false, email: null });
    const c = await agent.post(`/api/profiles/${p.id}/gmail/connect`).expect(400);
    expect(c.body.message).toMatch(/GOOGLE_CLIENT_ID/);
  });

  it("builds a Google consent URL with a signed state when configured", async () => {
    const configured = await createTestApp({ GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "secret", API_PUBLIC_URL: "https://api.example.com" });
    try {
      const agent = await ownerAgent(configured);
      const { body: p } = await agent.post("/api/profiles").send({ name: "Me" });
      const c = await agent.post(`/api/profiles/${p.id}/gmail/connect`).expect(201);
      const url = new URL(c.body.url);
      expect(url.hostname).toBe("accounts.google.com");
      expect(url.searchParams.get("redirect_uri")).toBe("https://api.example.com/api/gmail/callback");
      expect(url.searchParams.get("scope")).toContain("gmail.modify");
      expect(url.searchParams.get("access_type")).toBe("offline");
      // A tampered state is rejected.
      const bad = await agent.get(`/api/gmail/callback?code=x&state=nope`).expect(302);
      expect(bad.headers.location).toContain("gmail=invalid_state");
    } finally {
      await configured.close();
    }
  });
});
