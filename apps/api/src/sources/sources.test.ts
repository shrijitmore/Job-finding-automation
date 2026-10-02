import type { INestApplication } from "@nestjs/common";
import { PROPOSED_SOURCES, SEED_SOURCES } from "@jfa/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, ownerAgent, resetDatabase } from "../test-utils";

describe("sources", () => {
  let app: INestApplication;

  beforeEach(async () => {
    await resetDatabase();
    app ??= await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("seeds defaults once and never re-seeds after deletes", async () => {
    const agent = await ownerAgent(app);
    const first = await agent.get("/api/sources").expect(200);
    expect(first.body).toHaveLength(SEED_SOURCES.length);
    const names = first.body.map((s: { name: string }) => s.name);
    expect(names).toEqual(expect.arrayContaining(["HN Who is Hiring", "web3.career", "Wellfound", "We Work Remotely: Programming"]));
    // Creative and product boards are proposals only until confirmed.
    expect(names).not.toContain("Dribbble Jobs");

    await agent.delete(`/api/sources/${first.body[0].id}`).expect(200);
    const second = await agent.get("/api/sources").expect(200);
    expect(second.body).toHaveLength(SEED_SOURCES.length - 1);
  });

  it("lists proposals and adds one on confirmation", async () => {
    const agent = await ownerAgent(app);
    const proposed = await agent.get("/api/sources/proposed").expect(200);
    expect(proposed.body).toHaveLength(PROPOSED_SOURCES.length);
    const dribbble = proposed.body.find((p: { name: string }) => p.name === "Dribbble Jobs");
    await agent.post("/api/sources").send(dribbble).expect(201);
    const after = await agent.get("/api/sources/proposed").expect(200);
    expect(after.body).toHaveLength(PROPOSED_SOURCES.length - 1);
  });

  it("detects plugins, rejects banned sites and duplicates", async () => {
    const agent = await ownerAgent(app);
    const gh = await agent.post("/api/sources").send({ url: "https://job-boards.greenhouse.io/acme", fields: ["engineering"] }).expect(201);
    expect(gh.body).toMatchObject({ plugin: "greenhouse", name: "job-boards.greenhouse.io", enabled: true });
    const page = await agent.post("/api/sources").send({ url: "https://acme.com/careers", name: "Acme", fields: ["design"] }).expect(201);
    expect(page.body.plugin).toBe("generic");
    await agent.post("/api/sources").send({ url: "https://acme.com/careers", fields: ["design"] }).expect(409);
    await agent.post("/api/sources").send({ url: "https://www.linkedin.com/jobs", fields: ["design"] }).expect(400);
    await agent.post("/api/sources").send({ url: "not a url", fields: ["design"] }).expect(400);
    await agent.post("/api/sources").send({ url: "https://x.com", fields: [] }).expect(400);
  });

  it("toggles sources and queues a scan", async () => {
    const agent = await ownerAgent(app);
    const { body: list } = await agent.get("/api/sources");
    const s = list[0];
    const off = await agent.patch(`/api/sources/${s.id}`).send({ enabled: false }).expect(200);
    expect(off.body.enabled).toBe(false);
    const scan = await agent.post(`/api/sources/${s.id}/scan`).expect(201);
    expect(scan.body.jobId).toBeTruthy();
  });
});
