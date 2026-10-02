import { readFileSync } from "node:fs";
import path from "node:path";
import type { TestingModule } from "@nestjs/testing";
import { createDb, eq, jobs, sources, type Db, type Source } from "@jfa/db";
import type { NormalizedJob } from "@jfa/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, createUser, createWorker, fixtureServer, resetDatabase } from "../test-utils";
import { FetchService } from "./fetch.service";

const rss = readFileSync(path.resolve(__dirname, "../../../../packages/scraper/fixtures/wwr-programming.rss"), "utf8");

function job(over: Partial<NormalizedJob>): NormalizedJob {
  return {
    title: "Backend Engineer",
    company: "Acme",
    location: "Remote",
    url: "https://acme.com/jobs/1",
    canonicalUrl: "https://acme.com/jobs/1",
    description: "short",
    postedAt: null,
    applyEmail: null,
    applyUrl: null,
    jobType: null,
    workMode: "remote",
    ats: null,
    sourceId: "",
    fields: ["engineering"],
    ...over,
  };
}

describe("FetchService", () => {
  let worker: TestingModule;
  let svc: FetchService;
  let db: Db;
  let end: () => Promise<void>;

  beforeAll(async () => {
    worker = await createWorker();
    svc = worker.get(FetchService);
    const h = createDb(TEST_DATABASE_URL, { max: 2 });
    db = h.db;
    end = () => h.pool.end();
  });

  afterAll(async () => {
    await worker?.close();
    await end?.();
  });

  beforeEach(resetDatabase);

  it("dedupes against stored jobs by canonical URL and by company + title", async () => {
    const first = await svc.persist([job({}), job({ url: "https://acme.com/jobs/2", canonicalUrl: "https://acme.com/jobs/2", title: "Designer" })]);
    expect(first.newIds).toHaveLength(2);
    const second = await svc.persist([
      job({ description: "a much longer description than before" }),
      job({ url: "https://board.example/acme-designer", canonicalUrl: "https://board.example/acme-designer", company: "Acme Inc.", title: "designer" }),
      job({ url: "https://acme.com/jobs/3", canonicalUrl: "https://acme.com/jobs/3", title: "Video Editor" }),
    ]);
    expect(second.newIds).toHaveLength(1);
    expect(second.ids).toEqual(expect.arrayContaining(first.ids));
    const all = await db.select().from(jobs);
    expect(all).toHaveLength(3);
    expect(all.find((j) => j.title === "Backend Engineer")?.description).toContain("much longer");
  });

  it("isolates source failures and backs off blocked sources", async () => {
    const server = await fixtureServer({
      "/feed.rss": { body: rss, type: "application/rss+xml" },
      "/blocked": { status: 403, body: "Forbidden" },
    });
    try {
      const userId = await createUser();
      const rows: Source[] = await db
        .insert(sources)
        .values([
          { userId, name: "Good feed", plugin: "rss", url: `${server.base}/feed.rss`, fields: ["engineering"] },
          { userId, name: "Bad site", plugin: "generic", url: `${server.base}/blocked`, fields: ["engineering"] },
          { userId, name: "Broken", plugin: "greenhouse", url: `${server.base}/nope`, fields: ["engineering"] },
        ])
        .returning();
      const report = await svc.fetchSources(rows, null);
      const byName = Object.fromEntries(report.sources.map((s) => [s.name, s]));
      expect(byName["Good feed"]).toMatchObject({ status: "ok", jobs: 4, newJobs: 4 });
      expect(byName["Bad site"].status).toBe("blocked");
      expect(byName["Broken"].status).toBe("error");
      expect(report.blocked).toEqual(["Bad site"]);
      expect(report.newJobIds).toHaveLength(4);

      const [bad] = await db.select().from(sources).where(eq(sources.name, "Bad site"));
      expect(bad.blockedUntil!.getTime()).toBeGreaterThan(Date.now());
      const [good] = await db.select().from(sources).where(eq(sources.name, "Good feed"));
      expect(good).toMatchObject({ lastStatus: "ok", lastJobCount: 4, totalJobCount: 4 });

      // Next run skips the blocked source and finds no new jobs on the feed.
      const again = await svc.fetchSources(
        await db.select().from(sources).where(eq(sources.userId, userId)),
        null,
      );
      expect(again.sources.find((s) => s.name === "Bad site")?.status).toBe("skipped");
      expect(again.newJobIds).toHaveLength(0);
      expect(again.jobIds).toHaveLength(4);
    } finally {
      await server.close();
    }
  });
});
