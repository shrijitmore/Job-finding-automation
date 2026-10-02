import { readFileSync } from "node:fs";
import path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { SAMPLE_RESUME } from "@jfa/core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, ownerAgent, resetDatabase } from "../test-utils";

const fixtures = path.resolve(__dirname, "../../../../packages/core/test-fixtures");

describe("resume onboarding", () => {
  let app: INestApplication;

  beforeEach(async () => {
    await resetDatabase();
    app ??= await createTestApp({ LLM_FAKE: "1" });
  });

  afterAll(async () => {
    await app?.close();
  });

  it("uploads, parses and returns a draft with skill suggestions", async () => {
    const agent = await ownerAgent(app);
    const { body: p } = await agent.post("/api/profiles").send({ name: "Me" });
    const res = await agent
      .post(`/api/profiles/${p.id}/resume`)
      .attach("file", readFileSync(path.join(fixtures, "resume.pdf")), "resume.pdf")
      .expect(201);
    expect(res.body.draft.contact.name).toBe(SAMPLE_RESUME.contact.name);
    expect(res.body.suggestedSkills).toContain("TypeScript");

    const file = await agent.get(`/api/profiles/${p.id}/resume/file`).expect(200);
    expect(file.headers["content-type"]).toBe("application/pdf");

    // Draft is not saved until the user confirms.
    const fresh = await agent.get(`/api/profiles/${p.id}`);
    expect(fresh.body.masterResume).toBeNull();
    await agent.patch(`/api/profiles/${p.id}`).send({ masterResume: res.body.draft }).expect(200);
  });

  it("rejects unsupported files", async () => {
    const agent = await ownerAgent(app);
    const { body: p } = await agent.post("/api/profiles").send({ name: "Me" });
    await agent.post(`/api/profiles/${p.id}/resume`).attach("file", Buffer.from("hello"), "cv.txt").expect(400);
    await agent.post(`/api/profiles/${p.id}/resume`).expect(400);
  });

  it("manages skills with tiers and de-duplication", async () => {
    const agent = await ownerAgent(app);
    const { body: p } = await agent.post("/api/profiles").send({ name: "Me" });
    await agent.patch(`/api/profiles/${p.id}`).send({ masterResume: SAMPLE_RESUME }).expect(200);
    const put = await agent
      .put(`/api/profiles/${p.id}/skills`)
      .send({
        skills: [
          { name: "TypeScript", tier: "core" },
          { name: "typescript", tier: "extended" },
          { name: "Rust", tier: "extended" },
        ],
      })
      .expect(200);
    expect(put.body.skills).toEqual([
      { name: "TypeScript", tier: "core" },
      { name: "Rust", tier: "extended" },
    ]);
    expect(put.body.suggestions).toContain("React");
    expect(put.body.suggestions).not.toContain("TypeScript");
    await agent.put(`/api/profiles/${p.id}/skills`).send({ skills: [{ name: "X", tier: "maybe" }] }).expect(400);
  });

  it("stores the Claude key encrypted and masks it", async () => {
    const agent = await ownerAgent(app);
    const res = await agent.put("/api/settings/anthropic").send({ apiKey: "sk-ant-test-abcdef1234" }).expect(200);
    expect(res.body).toEqual({ configured: true, source: "saved", masked: "****1234" });
    const settings = await agent.get("/api/settings").expect(200);
    expect(JSON.stringify(settings.body)).not.toContain("abcdef");
  });
});
