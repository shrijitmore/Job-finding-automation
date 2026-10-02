import { defaultFakeHandlers, type FakeHandler } from "@jfa/core";
import type { MasterResume, ScoreResult, TailoredResume } from "@jfa/shared";

function textOf(req: Parameters<FakeHandler>[0]): string {
  return req.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
}

function between(text: string, tag: string): string {
  const m = text.match(new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`));
  return m?.[1] ?? "";
}

function coreSkills(text: string): string[] {
  const line = between(text, "skills").split("\n").find((l) => l.startsWith("Core"));
  return (line?.split(":")[1] ?? "").split(",").map((s) => s.trim()).filter((s) => s && s !== "none");
}

function extendedSkills(text: string): string[] {
  const line = between(text, "skills").split("\n").find((l) => l.startsWith("Extended"));
  return (line?.split(":").slice(1).join(":") ?? "").split(",").map((s) => s.trim()).filter((s) => s && s !== "none");
}

/**
 * Deterministic stand-ins for every Claude call in the pipeline. Scores by skill overlap,
 * tailors by reusing master bullets verbatim. Used by tests, e2e and LLM_FAKE=1.
 */
export function pipelineFakeHandlers(): Record<string, FakeHandler> {
  const tailor: FakeHandler = (req) => {
    const text = textOf(req);
    const master = JSON.parse(between(text, "master_resume")) as MasterResume;
    const job = between(text, "job");
    const company = job.match(/Company: (.*)/)?.[1] ?? "your team";
    const title = job.match(/Title: (.*)/)?.[1] ?? "this role";
    const core = coreSkills(text);
    const ext = extendedSkills(text).filter((s) => job.toLowerCase().includes(s.toLowerCase()));
    const link = master.portfolioLinks[0]?.url;
    const out: TailoredResume = {
      summary: `${master.contact.headline}. ${master.summary}`.trim(),
      experience: master.experience.map((e) => ({ id: e.id, bullets: e.bullets.slice(0, 4) })),
      projects: master.projects.slice(0, 2).map((p) => ({ id: p.id, bullets: p.bullets.slice(0, 2) })),
      skills: core.slice(0, 12),
      alsoWorkingWith: ext,
      portfolioLinks: master.portfolioLinks.map((l) => l.url),
      coverNote: `Hello ${company} team. I am applying for the ${title} role. ${master.summary} ${link ? `My work: ${link}.` : ""} Thank you for reading.`,
    };
    return out;
  };
  return {
    ...defaultFakeHandlers(),
    score: (req) => {
      const text = textOf(req);
      const job = between(text, "job").toLowerCase();
      const core = coreSkills(text);
      const matched = core.filter((s) => job.includes(s.toLowerCase()));
      const out: ScoreResult = {
        fit_score: Math.min(95, 40 + matched.length * 12),
        role_type: (between(text, "target_roles").split(";")[0] ?? "").replace(/\s*\(.*\)$/, "").trim() || "General",
        field: "engineering",
        reasons: matched.length ? [`Matches ${matched.join(", ")}`] : ["Few overlapping skills"],
        matched_skills: matched,
        missing_skills: [],
        red_flags: [],
        apply_channel: "manual",
      };
      return out;
    },
    tailor,
    tailor_retry: tailor,
    validate: () => ({ passed: true, issues: [] }),
    job_extract: () => ({ jobs: [] }),
    reply_classify: (req) => {
      const text = textOf(req).toLowerCase();
      const category = /interview|call|chat|schedule/.test(text)
        ? "interview_scheduling"
        : /salary|compensation|ctc/.test(text)
          ? "salary_question"
          : /assignment|take-home|test task|assessment/.test(text)
            ? "assessment"
            : /unfortunately|not moving forward|other candidates/.test(text)
              ? "rejection"
              : /portfolio|work samples|reel/.test(text)
                ? "portfolio_request"
                : /resume|cv/.test(text)
                  ? "resume_request"
                  : "other";
      return { category, confidence: 0.9, summary: `Recruiter message: ${category}`, suggested_reply: "Thanks for reaching out. I will confirm my availability shortly." };
    },
  };
}
