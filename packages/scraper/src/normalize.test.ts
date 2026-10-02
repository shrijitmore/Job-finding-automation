import { describe, expect, it } from "vitest";
import { canonicalUrl, dedupeHash, dedupeJobs, detectAts, detectWorkMode, normalizeJobType, parsePostedDate } from "./normalize";

describe("canonicalUrl", () => {
  it("strips tracking params, fragments, www and trailing slash", () => {
    expect(canonicalUrl("http://WWW.Example.com/jobs/123/?utm_source=x&b=2&a=1#apply")).toBe("https://example.com/jobs/123?a=1&b=2");
    expect(canonicalUrl("https://boards.greenhouse.io/acme/jobs/1?gh_src=abc")).toBe("https://job-boards.greenhouse.io/acme/jobs/1");
    expect(canonicalUrl("https://jobs.lever.co/acme/abc?lever-source=LinkedIn")).toBe("https://jobs.lever.co/acme/abc");
  });

  it("keeps identifying params", () => {
    expect(canonicalUrl("https://acme.com/careers?gh_jid=42")).toBe("https://acme.com/careers?gh_jid=42");
  });
});

describe("dedupe", () => {
  it("matches the same job across boards by company and title", () => {
    expect(dedupeHash("Acme, Inc.", "Sr. Backend Engineer")).toBe(dedupeHash("acme", "Senior Backend Engineer"));
    expect(dedupeHash("Acme", "Backend Engineer (Remote)")).toBe(dedupeHash("ACME Labs", "Backend Engineer"));
    expect(dedupeHash("Acme", "Frontend Engineer")).not.toBe(dedupeHash("Acme", "Backend Engineer"));
  });

  it("removes URL and company+title duplicates within a batch", () => {
    const jobs = [
      { canonicalUrl: "https://a.com/1", company: "Acme", title: "Designer" },
      { canonicalUrl: "https://a.com/1", company: "Acme", title: "Designer II" },
      { canonicalUrl: "https://b.com/9", company: "Acme Inc", title: "designer" },
      { canonicalUrl: "https://a.com/2", company: "Acme", title: "Video Editor" },
    ];
    expect(dedupeJobs(jobs).map((j) => j.canonicalUrl)).toEqual(["https://a.com/1", "https://a.com/2"]);
  });
});

describe("field parsing", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  it("parses posted dates", () => {
    expect(parsePostedDate("2026-09-30", now)?.toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(parsePostedDate("3d", now)?.toISOString().slice(0, 10)).toBe("2026-09-29");
    expect(parsePostedDate("2 weeks ago", now)?.toISOString().slice(0, 10)).toBe("2026-09-18");
    expect(parsePostedDate("6h", now)?.toISOString().slice(0, 13)).toBe("2026-10-02T06");
    expect(parsePostedDate("1 month ago", now)?.toISOString().slice(0, 10)).toBe("2026-09-02");
    expect(parsePostedDate("today", now)).toEqual(now);
    expect(parsePostedDate(1790000000000, now)?.getFullYear()).toBe(2026);
    expect(parsePostedDate("not a date", now)).toBeNull();
    expect(parsePostedDate("", now)).toBeNull();
  });

  it("normalizes job types and work modes", () => {
    expect(normalizeJobType("FullTime")).toBe("full-time");
    expect(normalizeJobType("Contractor")).toBe("contract");
    expect(normalizeJobType("Freelance gig")).toBe("freelance");
    expect(normalizeJobType("Part time")).toBe("part-time");
    expect(detectWorkMode("Remote (EU)")).toBe("remote");
    expect(detectWorkMode("Hybrid - Pune")).toBe("hybrid");
    expect(detectWorkMode("San Francisco, CA")).toBeNull();
  });

  it("detects ATS boards and job ids", () => {
    expect(detectAts("https://job-boards.greenhouse.io/acme/jobs/123")).toEqual({ ats: "greenhouse", board: "acme", jobId: "123" });
    expect(detectAts("https://jobs.lever.co/acme/abc-def/apply")).toEqual({ ats: "lever", board: "acme", jobId: "abc-def" });
    expect(detectAts("https://jobs.ashbyhq.com/acme")).toEqual({ ats: "ashby", board: "acme", jobId: null });
    expect(detectAts("https://acme.com/careers")).toBeNull();
  });
});
