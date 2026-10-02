import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetDatabase } from "../test-utils";

describe("auth", () => {
  let app: INestApplication;

  beforeEach(async () => {
    await resetDatabase();
    app ??= await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("reports that setup is needed on a fresh install", async () => {
    const res = await request(app.getHttpServer()).get("/api/auth/status").expect(200);
    expect(res.body).toMatchObject({ hasOwner: false, setupAllowed: true, user: null });
  });

  it("sets up the owner once, then logs in", async () => {
    const server = app.getHttpServer();
    const setup = await request(server)
      .post("/api/auth/setup")
      .send({ email: "Owner@Example.com", password: "password123" })
      .expect(201);
    expect(setup.body.user.email).toBe("owner@example.com");
    expect(setup.headers["set-cookie"]?.[0]).toMatch(/jfa_session=.*HttpOnly/);

    await request(server)
      .post("/api/auth/setup")
      .send({ email: "other@example.com", password: "password123" })
      .expect(409);

    await request(server).post("/api/auth/login").send({ email: "owner@example.com", password: "wrongpass1" }).expect(401);

    const agent = request.agent(server);
    await agent.post("/api/auth/login").send({ email: "owner@example.com", password: "password123" }).expect(200);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.user.email).toBe("owner@example.com");
  });

  it("rejects protected routes without a session", async () => {
    await request(app.getHttpServer()).get("/api/profiles").expect(401);
    await request(app.getHttpServer()).get("/api/profiles").set("Authorization", "Bearer junk").expect(401);
  });

  it("accepts a bearer token", async () => {
    const server = app.getHttpServer();
    await request(server).post("/api/auth/setup").send({ email: "a@b.co", password: "password123" }).expect(201);
    const login = await request(server).post("/api/auth/login").send({ email: "a@b.co", password: "password123" });
    await request(server).get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`).expect(200);
  });
});
