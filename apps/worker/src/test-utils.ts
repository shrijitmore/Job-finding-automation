import "reflect-metadata";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Test, type TestingModule } from "@nestjs/testing";
import { createDb, sql, users } from "@jfa/db";
import { loadConfig } from "./config";
import { WorkerModule, type WorkerOverrides } from "./worker.module";

export const TEST_DATABASE_URL =
  process.env.TEST_WORKER_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/jfa_test_worker";

export async function resetDatabase(): Promise<void> {
  const { db, pool } = createDb(TEST_DATABASE_URL, { max: 1 });
  await db.execute(
    sql`truncate users, profiles, profile_skills, credentials, sources, page_cache, jobs, runs, run_events, applications, replies, token_usage restart identity cascade`,
  );
  await pool.end();
}

export async function createWorker(env: Record<string, string> = {}, overrides: WorkerOverrides = {}): Promise<TestingModule> {
  const config = loadConfig({
    DATABASE_URL: TEST_DATABASE_URL,
    ENCRYPTION_KEY: "test-encryption-key-1234567890",
    LLM_FAKE: "1",
    SCRAPE_MIN_DELAY_MS: "0",
    SCRAPE_MAX_DELAY_MS: "0",
    APPLY_MIN_DELAY_MS: "0",
    APPLY_MAX_DELAY_MS: "0",
    LOCAL_STORAGE_DIR: "/tmp/jfa-worker-test-storage",
    ...env,
  } as NodeJS.ProcessEnv);
  const moduleRef = await Test.createTestingModule({ imports: [WorkerModule.forRoot(config, { noConsumers: true, ...overrides })] }).compile();
  await moduleRef.init();
  return moduleRef;
}

export async function createUser(): Promise<string> {
  const { db, pool } = createDb(TEST_DATABASE_URL, { max: 1 });
  const [u] = await db.insert(users).values({ email: `u${Date.now()}@example.com`, passwordHash: "x" }).returning();
  await pool.end();
  return u.id;
}

/** Serves fixed responses on localhost so scraping can be tested end to end without the internet. */
export async function fixtureServer(routes: Record<string, { status?: number; body: string; type?: string }>) {
  const server: Server = createServer((req, res) => {
    const r = routes[req.url ?? ""];
    if (!r) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(r.status ?? 200, { "content-type": r.type ?? "text/html" }).end(r.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}
