import { DEFAULT_PREFERENCES, type Preferences } from "@jfa/shared";
import { describe, expect, it } from "vitest";
import { type FilterableJob, companyKey, hardFilter, requiredYears } from "./filter";
import { matchRole } from "./roles";

const NOW = new Date("2026-10-02T12:00:00Z");
const day = 86_400_000;

function job(over: Partial<FilterableJob>): FilterableJob {
  return {
    id: Math.random().toString(36),
    title: "Senior Backend Engineer",
    company: "Acme",
    location: "Remote",
    description: "We need 4+ years of experience with Node.js.",
    postedAt: new Date(NOW.getTime() - 2 * day),
    firstSeenAt: NOW,
    jobType: "full-time",
    workMode: "remote",
    ...over,
  };
}

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  ...DEFAULT_PREFERENCES,
  roleTypeIds: ["engineering:backend-engineer", "video:video-editor"],
  ...over,
});

function run(jobs: FilterableJob[], p = prefs(), extra: Partial<Parameters<typeof hardFilter>[1]> = {}) {
  return hardFilter(jobs, { prefs: p, now: NOW, recentCompanies: new Map(), cooldownDays: 30, seenJobIds: new Set(), ...extra });
}

describe("hard filters", () => {
  it("keeps a matching job", () => {
    expect(run([job({})]).kept).toHaveLength(1);
  });

  it("drops jobs older than 21 days, using first seen when posted date is unknown", () => {
    const r = run([job({ postedAt: new Date(NOW.getTime() - 22 * day) }), job({ postedAt: null, firstSeenAt: new Date(NOW.getTime() - 30 * day) }), job({ postedAt: null })]);
    expect(r.kept).toHaveLength(1);
    expect(r.rejected[0].reason).toMatch(/21 days/);
  });

  it("matches titles against target roles across professions", () => {
    const r = run([job({ title: "YouTube Video Editor" }), job({ title: "Account Executive" }), job({ title: "Backend Developer (Go)" })]);
    // "Backend Developer" matches the Backend Engineer role through its keywords.
    expect(r.kept.map((j) => j.title)).toEqual(["YouTube Video Editor", "Backend Developer (Go)"]);
    expect(r.rejected.map((x) => x.reason)).toEqual(["Title does not match any target role"]);
  });

  it("applies excluded companies and keywords", () => {
    const r = run([job({ company: "Evil Corp Inc." }), job({ description: "Commission only. 4+ years experience" })], prefs({ excludedCompanies: ["evil corp"], excludedKeywords: ["commission only"] }));
    expect(r.kept).toHaveLength(0);
    expect(r.rejected.map((x) => x.reason)).toEqual(["Excluded company", 'Contains excluded keyword "commission only"']);
  });

  it("checks job type, work mode and location", () => {
    const p = prefs({ jobTypes: ["full-time", "freelance"], workModes: ["remote", "hybrid"], locations: ["Pune", "Bengaluru"] });
    const r = run(
      [
        job({ jobType: "contract" }),
        job({ workMode: "onsite", location: "Pune" }),
        job({ workMode: "hybrid", location: "Berlin, Germany" }),
        job({ workMode: "hybrid", location: "Bengaluru, India" }),
        job({ workMode: null, jobType: null, location: "" }),
      ],
      p,
    );
    expect(r.kept).toHaveLength(2);
    expect(r.rejected.map((x) => x.reason)).toEqual(["Job type contract not wanted", "Work mode onsite not wanted", 'Location "Berlin, Germany" not in preferred locations']);
  });

  it("checks required years against the experience range", () => {
    const r = run([job({ description: "10+ years of experience required" }), job({ description: "1+ years of experience" })], prefs({ minYears: 2, maxYears: 6 }));
    expect(r.rejected.map((x) => x.reason)).toEqual(["Asks for 10+ years, above your max of 6", "Asks for 1+ years, below your min of 2"]);
  });

  it("enforces the per-company cooldown and skips seen jobs", () => {
    const seen = job({});
    const r = run([job({ company: "Globex" }), job({ company: "Initech" }), seen], prefs(), {
      recentCompanies: new Map([
        [companyKey("Globex"), new Date(NOW.getTime() - 10 * day)],
        [companyKey("Initech"), new Date(NOW.getTime() - 40 * day)],
      ]),
      seenJobIds: new Set([seen.id]),
    });
    expect(r.kept.map((j) => j.company)).toEqual(["Initech"]);
    expect(r.rejected.map((x) => x.reason)).toEqual(["Applied to Globex within the last 30 days", "Already processed for this profile"]);
  });
});

describe("helpers", () => {
  it("reads required years", () => {
    expect(requiredYears("5+ years of backend experience")).toBe(5);
    expect(requiredYears("3-5 years of relevant experience")).toBe(3);
    expect(requiredYears("Minimum 2 years experience. 7 years of experience preferred")).toBe(7);
    expect(requiredYears("We are 10 years old")).toBeNull();
  });

  it("matches custom and generic roles by whole word", () => {
    const custom = [{ id: "c", label: "Thumbnail Designer", field: "design" as const, keywords: ["thumbnail"] }];
    expect(matchRole("YouTube Thumbnail Artist", custom)?.label).toBe("Thumbnail Designer");
    expect(matchRole("Creditor relations", [{ id: "v", label: "Video Editor", field: "video" as const, keywords: ["editor"] }])).toBeNull();
  });
});
