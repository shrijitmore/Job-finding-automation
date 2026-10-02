import type { TailoredResume } from "@jfa/shared";
import { describe, expect, it } from "vitest";
import { assembleResume } from "./document";
import { CREATIVE_RESUME, CREATIVE_SKILLS, STYLE, TECH_RESUME, TECH_SKILLS } from "./test-fixtures";
import { numbersIn, validateDeterministic } from "./validator";

function tailored(over: Partial<TailoredResume> = {}): TailoredResume {
  return {
    summary: "Full stack engineer who builds checkout and analytics products with React and Node.js.",
    experience: [
      { id: "exp-1", bullets: ["Built a checkout flow in React and TypeScript used by 2M monthly users", "Cut API latency by 40% with Redis caching"] },
      { id: "exp-2", bullets: ["Shipped an internal analytics dashboard with Node.js and PostgreSQL"] },
    ],
    projects: [{ id: "proj-1", bullets: ["Open source invoicing app with 1,200 GitHub stars"] }],
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
    alsoWorkingWith: ["Kubernetes"],
    portfolioLinks: ["https://github.com/janedoe"],
    coverNote: "Hello Ledgerly team. I build TypeScript and Node.js services. At Acme Corp I cut API latency by 40%. I would like to help with your GraphQL API.",
    ...over,
  };
}

function check(t: TailoredResume, extra: Partial<Parameters<typeof validateDeterministic>[0]> = {}) {
  const doc = assembleResume(TECH_RESUME, t, TECH_SKILLS, "engineering");
  return validateDeterministic({ doc, coverNote: t.coverNote, master: TECH_RESUME, skills: TECH_SKILLS, style: STYLE, field: "engineering", pageCount: 1, ...extra });
}

describe("validator", () => {
  it("passes a clean draft", () => {
    expect(check(tailored())).toEqual([]);
  });

  it("flags em dashes, en dashes and banned phrases", () => {
    const issues = check(tailored({ summary: "Engineer — passionate about products, 2019–2021." }));
    expect(issues).toEqual(expect.arrayContaining(["Contains an em dash (—)", "Contains an en dash (–)", 'Uses banned phrase "passionate about"']));
  });

  it("matches banned phrases on word boundaries only", () => {
    expect(check(tailored({ summary: "Built a dynamically typed parser." }))).toEqual([]);
    expect(check(tailored({ summary: "A dynamic engineer." }))).toContain('Uses banned phrase "dynamic"');
  });

  it("flags bullets that open with power verbs", () => {
    const issues = check(tailored({ experience: [{ id: "exp-1", bullets: ["Spearheaded the checkout flow used by 2M monthly users"] }] }));
    expect(issues).toEqual(expect.arrayContaining(['Bullet starts with power verb "Spearheaded"']));
  });

  it("flags invented numbers but accepts reformatted ones", () => {
    expect(check(tailored({ summary: "Served 7M users and cut costs by 25%." }))).toEqual(
      expect.arrayContaining(['Number "7" does not appear in the master resume', 'Number "25" does not appear in the master resume']),
    );
    expect(check(tailored({ summary: "Project with 1200 stars and 5 years of experience." }))).toEqual([]);
    expect(numbersIn("1,200 stars, 2.5x and 40%")).toEqual(["1200", "2.5", "40"]);
  });

  it("keeps skills to the profile list and flags JD skills the candidate lacks", () => {
    const doc = assembleResume(TECH_RESUME, tailored({ skills: ["TypeScript", "Kafka"], alsoWorkingWith: ["Go", "Rust"] }), TECH_SKILLS, "engineering");
    // Assembly already strips unknown skills.
    expect(doc.skills).toEqual(["TypeScript"]);
    expect(doc.alsoWorkingWith).toEqual(["Go"]);
    // A skill smuggled into a bullet is caught by the missing-skills check.
    const issues = check(tailored({ experience: [{ id: "exp-1", bullets: ["Built streaming pipelines with Kafka"] }] }), { missingSkills: ["Kafka", "Kubernetes"] });
    expect(issues).toContain('Mentions "Kafka", which the candidate does not have');
  });

  it("flags tampered facts, long cover notes and multi-page PDFs", () => {
    const t = tailored({ coverNote: Array(130).fill("word").join(" ") });
    const doc = assembleResume(TECH_RESUME, t, TECH_SKILLS, "engineering");
    doc.experience[0] = { ...doc.experience[0], title: "Principal Engineer", dates: "2015 to Present" };
    const issues = validateDeterministic({ doc, coverNote: t.coverNote, master: TECH_RESUME, skills: TECH_SKILLS, style: STYLE, field: "engineering", pageCount: 2 });
    expect(issues).toEqual(
      expect.arrayContaining([
        'Experience "Principal Engineer at Acme Corp" does not match the master resume',
        "Cover note is 130 words, over 120",
        "PDF is 2 pages, must be exactly 1",
      ]),
    );
  });

  it("requires a portfolio link in creative cover notes", () => {
    const t: TailoredResume = {
      summary: "Video editor for YouTube channels.",
      experience: [{ id: "exp-1", bullets: ["Edited 150 YouTube videos with 30M total views in Adobe Premiere Pro"] }],
      projects: [],
      skills: ["Adobe Premiere Pro"],
      alsoWorkingWith: [],
      portfolioLinks: ["https://behance.net/ravikumar"],
      coverNote: "Hello Brightside team. I edit YouTube videos.",
    };
    const doc = assembleResume(CREATIVE_RESUME, t, CREATIVE_SKILLS, "video");
    expect(doc.template).toBe("portfolio");
    expect(doc.portfolio[0].url).toBe("https://behance.net/ravikumar");
    const base = { doc, master: CREATIVE_RESUME, skills: CREATIVE_SKILLS, style: STYLE, field: "video" as const, pageCount: 1 };
    expect(validateDeterministic({ ...base, coverNote: t.coverNote })).toContain("Creative role cover note must include a portfolio link");
    expect(validateDeterministic({ ...base, coverNote: `${t.coverNote} Reel: https://youtube.com/@ravicuts` })).toEqual([]);
  });
});

describe("assembleResume", () => {
  it("never changes titles, companies, dates or education and keeps every job", () => {
    const doc = assembleResume(TECH_RESUME, tailored({ experience: [{ id: "exp-2", bullets: ["x"] }, { id: "exp-999", bullets: ["fake job"] }] }), TECH_SKILLS, "ai");
    expect(doc.template).toBe("technical");
    expect(doc.experience.map((e) => [e.title, e.company, e.dates])).toEqual([
      ["Senior Software Engineer", "Acme Corp", "Jan 2022 to Present"],
      ["Software Engineer", "Globex", "Jun 2019 to Dec 2021"],
    ]);
    // A job the model skipped keeps its master bullets; an unknown id is ignored.
    expect(doc.experience[0].bullets[0]).toBe(TECH_RESUME.experience[0].bullets[0]);
    expect(JSON.stringify(doc)).not.toContain("fake job");
    expect(doc.education[0].institution).toBe("University of Pune");
  });

  it("only uses portfolio links from the master resume and picks templates by field", () => {
    const doc = assembleResume(TECH_RESUME, tailored({ portfolioLinks: ["https://evil.example", "https://janedoe.dev"] }), TECH_SKILLS, "product");
    expect(doc.template).toBe("impact");
    expect(doc.portfolio.map((p) => p.url)).toEqual(["https://janedoe.dev", "https://github.com/janedoe"]);
  });
});
