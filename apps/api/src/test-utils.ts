import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { createDb, sql } from "@jfa/db";
import request from "supertest";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
import { loadConfig } from "./config";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/jfa_test";

export async function resetDatabase(): Promise<void> {
  const { db, pool } = createDb(TEST_DATABASE_URL, { max: 1 });
  await db.execute(
    sql`truncate users, profiles, profile_skills, credentials, sources, page_cache, jobs, runs, run_events, applications, replies, token_usage restart identity cascade`,
  );
  await pool.end();
}

export async function createTestApp(env: Record<string, string> = {}): Promise<INestApplication> {
  const config = loadConfig({
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: "test-jwt-secret-1234567890",
    ENCRYPTION_KEY: "test-encryption-key-1234567890",
    LOCAL_STORAGE_DIR: "/tmp/jfa-test-storage",
    ...env,
  } as NodeJS.ProcessEnv);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, config);
  await app.init();
  return app;
}

/** Sets up the owner and returns a supertest agent that carries the session cookie. */
export async function ownerAgent(app: INestApplication) {
  const agent = request.agent(app.getHttpServer());
  await agent.post("/api/auth/setup").send({ email: "owner@example.com", password: "password123" }).expect(201);
  return agent;
}
