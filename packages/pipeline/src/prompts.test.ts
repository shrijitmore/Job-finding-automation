import { FakeLlm } from "@jfa/core";
import { ROLE_CATALOG, ScoreResultSchema, type TailoredResume } from "@jfa/shared";
import { describe, expect, it } from "vitest";
import { pipelineFakeHandlers } from "./fake";
import { SCORE_SYSTEM, TAILOR_SYSTEM, applyChannelFor, scoreJob, styleBlock, tailorResume } from "./prompts";
import { tailorAndValidate } from "./tailor-flow";
import { CREATIVE_RESUME, CREATIVE_SKILLS, STYLE, TECH_RESUME, TECH_SKILLS, loadJds } from "./test-fixtures";

const jds = loadJds();
const roles = ROLE_CATALOG.filter((r) => ["engineering:backend-engineer", "video:video-editor"].includes(r.id));

describe("fixture JDs from many professions", () => {
  it("covers every target field", () => {
    expect(new Set(jds.map((j) => j.field))).toEqual(new Set(["engineering", "ai", "web3", "product", "video", "content", "design", "marketing"]));
  });

  it.each(jds.map((j) => [j.file, j] as const))("scores %s with the resume and JD in the prompt", async (_f, jd) => {
    const llm = new FakeLlm(pipelineFakeHandlers());
    const master = jd.field === "video" || jd.field === "content" ? CREATIVE_RESUME : TECH_RESUME;
    const skills = master === CREATIVE_RESUME ? CREATIVE_SKILLS : TECH_SKILLS;
    const score = await scoreJob(llm, { job: jd, master, skills, roles });
    expect(ScoreResultSchema.parse(score)).toBeTruthy();
    expect(llm.calls[0].text).toContain(jd.description.slice(0, 60));
    expect(llm.calls[0].text).toContain(master.contact.name);
    // Apply channel comes from scraped facts.
    expect(score.apply_channel).toBe(jd.applyEmail ? "email" : jd.ats ?? "manual");
  });

  it("scores relevant jobs above irrelevant ones with the fake scorer", async () => {
    const llm = new FakeLlm(pipelineFakeHandlers());
    const backend = await scoreJob(llm, { job: jds.find((j) => j.file === "software-backend.txt")!, master: TECH_RESUME, skills: TECH_SKILLS, roles });
    const growth = await scoreJob(llm, { job: jds.find((j) => j.file === "growth-marketer.txt")!, master: TECH_RESUME, skills: TECH_SKILLS, roles });
    expect(backend.fit_score).toBeGreaterThan(growth.fit_score);
  });
});

describe("prompts", () => {
  it("states the truthfulness rules", () => {
    expect(TAILOR_SYSTEM).toMatch(/Never change or invent titles, companies, dates, education or years of experience/);
    expect(TAILOR_SYSTEM).toMatch(/Never invent metrics/);
    expect(TAILOR_SYSTEM).toMatch(/under 120 words/);
    expect(SCORE_SYSTEM).toMatch(/red_flags/);
  });

  it("turns style rules into instructions", () => {
    const s = styleBlock({ ...STYLE, extraInstructions: "Use British spelling." });
    expect(s).toContain("Never use the em dash");
    expect(s).toContain('"passionate about"');
    expect(s).toContain("Use British spelling.");
  });

  it("decides apply channels deterministically", () => {
    const base = { title: "", company: "", location: "", description: "", applyEmail: null, ats: null, atsJobId: null };
    expect(applyChannelFor({ ...base, applyEmail: "a@b.co", ats: "lever", atsJobId: "1" })).toBe("email");
    expect(applyChannelFor({ ...base, ats: "ashby", atsJobId: "x" })).toBe("ashby");
    expect(applyChannelFor({ ...base, ats: "greenhouse", atsJobId: null })).toBe("manual");
  });

  it("asks for a portfolio link in creative cover notes", async () => {
    const llm = new FakeLlm(pipelineFakeHandlers());
    const jd = jds.find((j) => j.file === "video-editor.txt")!;
    await tailorResume(llm, { job: jd, master: CREATIVE_RESUME, skills: CREATIVE_SKILLS, style: STYLE, field: "video", roleType: "Video Editor" });
    expect(llm.calls[0].text).toMatch(/creative role/i);
  });
});

describe("tailorAndValidate", () => {
  const renderer = { renderResume: async () => ({ pdf: Buffer.from("%PDF"), pageCount: 1, scale: 1, html: "" }) };

  it("passes on the first try for clean output, across templates", async () => {
    for (const jd of jds) {
      const creative = ["video", "content", "design"].includes(jd.field);
      const llm = new FakeLlm(pipelineFakeHandlers());
      const out = await tailorAndValidate(llm, renderer, {
        job: jd,
        master: creative ? CREATIVE_RESUME : TECH_RESUME,
        skills: creative ? CREATIVE_SKILLS : TECH_SKILLS,
        style: STYLE,
        field: jd.field,
        roleType: jd.title,
        missingSkills: [],
      });
      expect(out.issues, jd.file).toEqual([]);
      expect(out.ok).toBe(true);
      expect(out.attempts).toBe(1);
      expect(llm.calls.map((c) => c.purpose)).toEqual(["tailor", "validate"]);
    }
  });

  it("regenerates once with feedback, then skips if still invalid", async () => {
    const bad = (): TailoredResume => ({
      ...(pipelineFakeHandlers().tailor as never as (r: unknown) => TailoredResume)({ content: [], system: "", purpose: "", schema: null as never }),
    });
    void bad;
    let attempts = 0;
    const handlers = pipelineFakeHandlers();
    const llm = new FakeLlm({
      ...handlers,
      tailor: (req) => {
        attempts++;
        const t = handlers.tailor(req) as TailoredResume;
        return { ...t, summary: `${t.summary} Grew revenue 300% — fast.` };
      },
      tailor_retry: (req) => {
        attempts++;
        const t = handlers.tailor(req) as TailoredResume;
        return { ...t, summary: `${t.summary} Still 300% growth.` };
      },
    });
    const jd = jds[0];
    const out = await tailorAndValidate(llm, renderer, { job: jd, master: TECH_RESUME, skills: TECH_SKILLS, style: STYLE, field: "engineering", roleType: "Backend Engineer", missingSkills: [] });
    expect(out.ok).toBe(false);
    expect(out.attempts).toBe(2);
    expect(attempts).toBe(2);
    expect(out.issues).toContain('Number "300" does not appear in the master resume');
    // The retry prompt carried the first attempt's issues.
    const retry = llm.calls.find((c) => c.purpose === "tailor_retry")!;
    expect(retry.text).toContain("Contains an em dash");
  });

  it("fails when the Claude reviewer rejects the draft, and recovers on retry", async () => {
    let reviews = 0;
    const llm = new FakeLlm({
      ...pipelineFakeHandlers(),
      validate: () => (++reviews === 1 ? { passed: false, issues: ["Claims leadership not in resume"] } : { passed: true, issues: [] }),
    });
    const out = await tailorAndValidate(llm, renderer, { job: jds[0], master: TECH_RESUME, skills: TECH_SKILLS, style: STYLE, field: "engineering", roleType: "Backend Engineer", missingSkills: [] });
    expect(out).toMatchObject({ ok: true, attempts: 2 });
  });
});
