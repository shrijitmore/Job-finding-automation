import type { INestApplication } from "@nestjs/common";
import { DEFAULT_PREFERENCES } from "@jfa/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, ownerAgent, resetDatabase } from "../test-utils";

describe("profiles", () => {
  let app: INestApplication;

  beforeEach(async () => {
    await resetDatabase();
    app ??= await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("creates profiles with safe defaults", async () => {
    const agent = await ownerAgent(app);
    const created = await agent.post("/api/profiles").send({ name: "Me", timezone: "Europe/Berlin" }).expect(201);
    expect(created.body.schedule).toMatchObject({
      dryRun: true,
      dailyCap: 15,
      runTimes: ["07:00", "19:00"],
      timezone: "Europe/Berlin",
      companyCooldownDays: 30,
    });
    expect(created.body.styleRules.banEmDashes).toBe(true);

    await agent.post("/api/profiles").send({ name: "Friend" }).expect(201);
    const list = await agent.get("/api/profiles").expect(200);
    expect(list.body.map((p: { name: string }) => p.name)).toEqual(["Me", "Friend"]);
  });

  it("validates and applies patches", async () => {
    const agent = await ownerAgent(app);
    const { body: p } = await agent.post("/api/profiles").send({ name: "Me" });
    await agent
      .patch(`/api/profiles/${p.id}`)
      .send({ preferences: { ...DEFAULT_PREFERENCES, minFitScore: 150 } })
      .expect(400);
    const res = await agent
      .patch(`/api/profiles/${p.id}`)
      .send({ preferences: { ...DEFAULT_PREFERENCES, minFitScore: 80 }, onboarded: true })
      .expect(200);
    expect(res.body.preferences.minFitScore).toBe(80);
    expect(res.body.onboardedAt).toBeTruthy();
  });

  it("returns 404 for unknown profiles and deletes", async () => {
    const agent = await ownerAgent(app);
    await agent.get("/api/profiles/00000000-0000-0000-0000-000000000000").expect(404);
    const { body: p } = await agent.post("/api/profiles").send({ name: "Me" });
    await agent.delete(`/api/profiles/${p.id}`).expect(200);
    await agent.get(`/api/profiles/${p.id}`).expect(404);
  });
});
