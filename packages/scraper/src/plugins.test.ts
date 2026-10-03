import { FakeLlm } from "@jfa/core";
import { describe, expect, it } from "vitest";
import { scrapeSource } from "./runner";
import { findEmbeddedBoard } from "./plugins/generic";
import { parseHnComment } from "./plugins/hn";
import { fixture, makeCtx, memoryCache } from "./test-helpers";

const NOW = new Date("2026-10-02T12:00:00Z");

describe("ATS plugins read public JSON", () => {
  it("greenhouse", async () => {
    const ctx = makeCtx(
      { plugin: "greenhouse", url: "https://job-boards.greenhouse.io/anthropic", name: "Anthropic" },
      { "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true": fixture("greenhouse-anthropic.json") },
    );
    const out = await scrapeSource(ctx, NOW);
    expect(out.status).toBe("ok");
    expect(out.jobs).toHaveLength(3);
    const j = out.jobs[0];
    expect(j).toMatchObject({ company: "Anthropic", ats: "greenhouse", atsBoardToken: "anthropic", sourceId: "src-1" });
    expect(j.atsJobId).toMatch(/^\d+$/);
    expect(j.description.length).toBeGreaterThan(200);
    expect(j.description).not.toContain("&lt;");
    expect(j.postedAt).toMatch(/^\d{4}-/);
  });

  it("lever", async () => {
    const ctx = makeCtx(
      { plugin: "lever", url: "https://jobs.lever.co/palantir", name: "Palantir" },
      { "https://api.lever.co/v0/postings/palantir?mode=json": fixture("lever-palantir.json") },
    );
    const out = await scrapeSource(ctx, NOW);
    // Same title in two cities counts as one job: we only apply once per company and title.
    const titles = new Set(JSON.parse(fixture("lever-palantir.json")).map((p: { text: string }) => p.text));
    expect(out.jobs).toHaveLength(titles.size);
    expect(out.jobs[0]).toMatchObject({ company: "Palantir", ats: "lever", atsBoardToken: "palantir", jobType: "full-time", workMode: "hybrid" });
    expect(out.jobs[0].applyUrl).toMatch(/\/apply$/);
  });

  it("ashby", async () => {
    const ctx = makeCtx(
      { plugin: "ashby", url: "https://jobs.ashbyhq.com/openai", name: "OpenAI" },
      { "https://api.ashbyhq.com/posting-api/job-board/openai?includeCompensation=true": fixture("ashby-openai.json") },
    );
    const out = await scrapeSource(ctx, NOW);
    expect(out.jobs.length).toBeGreaterThan(0);
    expect(out.jobs[0]).toMatchObject({ company: "OpenAI", ats: "ashby", atsBoardToken: "openai", jobType: "full-time" });
  });
});

describe("RSS plugin", () => {
  it("parses We Work Remotely items", async () => {
    const url = "https://weworkremotely.com/categories/remote-programming-jobs.rss";
    const out = await scrapeSource(makeCtx({ plugin: "rss", url }, { [url]: fixture("wwr-programming.rss") }), NOW);
    expect(out.status).toBe("ok");
    expect(out.jobs).toHaveLength(4);
    expect(out.jobs[0].company).toBe("Samsara");
    expect(out.jobs[0].title).toBe("Staff Software Engineer");
    expect(out.jobs[0].url).toMatch(/^https:\/\/weworkremotely\.com\/remote-jobs\//);
    expect(out.jobs[0].description).toContain("About the role");
  });
});

describe("HN Who is Hiring", () => {
  it("finds the latest thread and parses top-level comments only", async () => {
    const ctx = makeCtx(
      { plugin: "hn_whoishiring", url: "https://news.ycombinator.com/submitted?id=whoishiring" },
      {
        "https://news.ycombinator.com/robots.txt": "User-Agent: *\nCrawl-delay: 30\nDisallow: /login",
        "https://news.ycombinator.com/submitted?id=whoishiring": fixture("hn-whoishiring-list.html"),
        "https://news.ycombinator.com/item?id=45000001": fixture("hn-whoishiring-thread.html"),
      },
    );
    const out = await scrapeSource(ctx, NOW);
    expect(out.status).toBe("ok");
    expect(out.jobs.map((j) => [j.company, j.title])).toEqual([
      ["Acme Robotics", "Senior Backend Engineer"],
      ["Pixelworks", "Founding AI Engineer, Product Designer"],
    ]);
    expect(out.jobs[0]).toMatchObject({ applyEmail: "jobs@acmerobotics.com", jobType: "full-time", workMode: "remote" });
    expect(out.jobs[0].url).toBe("https://news.ycombinator.com/item?id=45000101");
    // Crawl-delay of 30s is respected between page fetches.
    expect(Math.max(...ctx.sleeps)).toBeGreaterThanOrEqual(30_000);
  });

  it("parses comment headers", () => {
    expect(parseHnComment("Foo Inc | Remote | Staff ML Engineer | Contract")).toEqual({
      company: "Foo Inc",
      title: "Staff ML Engineer",
      location: "Remote",
      jobType: "Contract",
    });
    expect(parseHnComment("just a reply")).toBeNull();
  });
});

describe("generic extractor", () => {
  const url = "https://web3.career/";
  const extract = () => ({
    jobs: [
      {
        title: "Infrastructure Engineer",
        company: "Wintermute",
        location: "London, United Kingdom",
        url: "https://web3.career/infrastructure-engineer-wintermute-trading/154823",
        description: "",
        posted_date: "2026-10-02",
        apply_email: "",
        job_type: "",
      },
      {
        title: "Senior Solidity Engineer",
        company: "ChainCo",
        location: "Remote",
        url: "https://web3.career/senior-solidity-chainco/1",
        description: "",
        posted_date: "",
        apply_email: "",
        job_type: "",
      },
    ],
  });

  it("extracts with Claude, follows detail pages, and caches by content hash", async () => {
    const llm = new FakeLlm({ job_extract: extract });
    const cache = memoryCache();
    const routes = {
      [url]: fixture("web3career.html"),
      "https://web3.career/senior-solidity-chainco/1": fixture("detail-jsonld.html"),
      "https://web3.career/infrastructure-engineer-wintermute-trading/154823": "<html><body><main><h1>Infrastructure Engineer</h1><p>Run our trading infra.</p></main></body></html>",
    };
    const ctx = makeCtx({ plugin: "generic", url, fields: ["web3"] }, routes, { llm, cache });
    const out = await scrapeSource(ctx, NOW);
    expect(out.status).toBe("ok");
    expect(out.jobs).toHaveLength(2);
    expect(llm.calls[0].text).toContain("Infrastructure Engineer");
    expect(llm.calls[0].text).not.toContain("Login");

    const solidity = out.jobs.find((j) => j.company === "ChainCo")!;
    expect(solidity.description).toContain("audited smart contracts");
    expect(solidity.applyEmail).toBe("hiring@chainco.xyz");
    expect(solidity.postedAt?.slice(0, 10)).toBe("2026-09-28");
    expect(solidity.jobType).toBe("full-time");
    expect(solidity.applyUrl).toBe("https://jobs.lever.co/chainco/1234-abcd/apply");
    expect(solidity.ats).toBe("lever");

    // Second run with an unchanged page: no new Claude call, known jobs skip detail fetch.
    const ctx2 = makeCtx({ plugin: "generic", url, fields: ["web3"] }, routes, {
      llm,
      cache,
      known: out.jobs.map((j) => j.url),
    });
    const out2 = await scrapeSource(ctx2, NOW);
    expect(out2.jobs).toHaveLength(2);
    expect(llm.calls).toHaveLength(1);
    expect(ctx2.calls.filter((c) => c.includes("chainco"))).toHaveLength(0);
  });

  it("stops following detail pages once the time budget is used up", async () => {
    const routes = {
      [url]: fixture("web3career.html"),
      "https://web3.career/senior-solidity-chainco/1": fixture("detail-jsonld.html"),
      "https://web3.career/infrastructure-engineer-wintermute-trading/154823": "<html><body><main><h1>Infrastructure Engineer</h1><p>Run our trading infra.</p></main></body></html>",
    };
    let clock = 0;
    const ctx = makeCtx({ plugin: "generic", url, fields: ["web3"] }, routes, { llm: new FakeLlm({ job_extract: extract }) });
    // The clock moves 30s per check: the first listing is inside the 45s budget, the second is not.
    const out = await scrapeSource({ ...ctx, detailBudgetMs: 45_000, now: () => (clock += 30_000) }, NOW);
    expect(out.jobs).toHaveLength(2);
    expect(ctx.calls.filter((c) => /chainco\/1|wintermute/.test(c))).toHaveLength(1);
  });

  it("switches to the ATS JSON when a career page embeds a board", async () => {
    expect(findEmbeddedBoard(fixture("career-page-embed.html"))).toBe("https://job-boards.greenhouse.io/bloomhq");
    // A board that links many companies' ATS pages is not a career page.
    expect(findEmbeddedBoard('<a href="https://jobs.lever.co/a/1">x</a><a href="https://jobs.lever.co/b/2">y</a>')).toBeNull();
    expect(findEmbeddedBoard('<a href="https://jobs.lever.co/a/1">only one link</a>')).toBeNull();
    const ctx = makeCtx(
      { plugin: "generic", url: "https://bloom.example/careers", name: "Bloom" },
      {
        "https://bloom.example/careers": fixture("career-page-embed.html"),
        "https://boards-api.greenhouse.io/v1/boards/bloomhq/jobs?content=true": fixture("greenhouse-anthropic.json"),
      },
    );
    const out = await scrapeSource(ctx, NOW);
    expect(out.status).toBe("ok");
    expect(out.jobs[0].ats).toBe("greenhouse");
  });
});

describe("error isolation and blocking", () => {
  it("reports CAPTCHA pages as blocked without throwing", async () => {
    const url = "https://wellfound.com/jobs";
    const out = await scrapeSource(makeCtx({ plugin: "generic", url }, { [url]: { status: 200, body: fixture("captcha.html") } }), NOW);
    expect(out).toMatchObject({ status: "blocked", jobs: [] });
  });

  it("reports rate limits as blocked", async () => {
    const url = "https://example.com/jobs.rss";
    const out = await scrapeSource(makeCtx({ plugin: "rss", url }, { [url]: { status: 429, body: "slow down" } }), NOW);
    expect(out.status).toBe("blocked");
  });

  it("respects robots.txt", async () => {
    const url = "https://example.com/private/jobs";
    const out = await scrapeSource(
      makeCtx({ plugin: "generic", url }, { "https://example.com/robots.txt": "User-agent: *\nDisallow: /private" }),
      NOW,
    );
    expect(out.status).toBe("blocked");
    expect(out.error).toContain("robots.txt");
  });

  it("refuses LinkedIn, Naukri and Indeed", async () => {
    for (const url of ["https://www.linkedin.com/jobs", "https://www.naukri.com/jobs", "https://in.indeed.com/jobs"]) {
      const ctx = makeCtx({ plugin: "generic", url }, {});
      const out = await scrapeSource(ctx, NOW);
      expect(out.status).toBe("error");
      expect(ctx.calls).toHaveLength(0);
    }
  });

  it("returns errors instead of throwing", async () => {
    const out = await scrapeSource(makeCtx({ plugin: "greenhouse", url: "https://example.com/not-a-board" }, {}), NOW);
    expect(out.status).toBe("error");
  });
});
