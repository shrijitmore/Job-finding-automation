import type { LlmClient } from "@jfa/core";
import {
  FIELD_LABELS,
  ScoreResultSchema,
  TailoredResumeSchema,
  isCreativeField,
  type ApplyChannel,
  type Field,
  type MasterResume,
  type ProfileSkill,
  type RoleType,
  type ScoreResult,
  type StyleRules,
  type TailoredResume,
} from "@jfa/shared";
import { z } from "zod";

export interface JobForPrompt {
  title: string;
  company: string;
  location: string;
  description: string;
  applyEmail: string | null;
  ats: string | null;
  atsJobId: string | null;
}

const MAX_JD_CHARS = 14_000;

function jdBlock(job: JobForPrompt): string {
  return `<job>
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || "not stated"}
Description:
${job.description.slice(0, MAX_JD_CHARS)}
</job>`;
}

function skillsBlock(skills: ProfileSkill[]): string {
  const core = skills.filter((s) => s.tier === "core").map((s) => s.name);
  const ext = skills.filter((s) => s.tier === "extended").map((s) => s.name);
  return `<skills>
Core (uses these): ${core.join(", ") || "none"}
Extended (can pick up, list only under "Also working with"): ${ext.join(", ") || "none"}
</skills>`;
}

function resumeBlock(master: MasterResume): string {
  return `<master_resume>\n${JSON.stringify(master, null, 1)}\n</master_resume>`;
}

/**
 * Apply channel decided from scraped facts, not the model: an email in the JD wins, then a
 * supported ATS job page, otherwise manual. The model's suggestion is stored only for display.
 */
export function applyChannelFor(job: JobForPrompt): ApplyChannel {
  if (job.applyEmail) return "email";
  if ((job.ats === "greenhouse" || job.ats === "lever" || job.ats === "ashby") && job.atsJobId) return job.ats;
  return "manual";
}

// ---------- SCORE ----------

export const SCORE_SYSTEM = `You are a hiring screener. You compare one job description with one candidate and return a fit score as JSON. The candidate can be in any profession: software, AI, Web3, product, design, video editing, content creation, AI content creation, marketing or leadership.

How to score fit_score (0 to 100):
- 90+: the candidate matches the role, seniority and nearly all must-have skills.
- 70 to 89: strong match with small gaps.
- 50 to 69: partial match; several must-haves missing or seniority off.
- below 50: different role, field or level.
Weigh must-have requirements over nice-to-haves. For creative roles (design, video, content), weigh portfolio evidence and tools (e.g. Premiere Pro, After Effects, Figma) as heavily as titles.

Fields:
- role_type: the label of the candidate's target role that best fits this job.
- field: one of engineering, ai, web3, product, design, video, content, marketing, leadership.
- reasons: 2 to 4 short, specific reasons, mentioning concrete evidence from the resume.
- matched_skills: JD skills the candidate has (from the skills list or resume).
- missing_skills: JD skills or tools the candidate does not show anywhere.
- red_flags: dealbreakers such as required visa or clearance, on-site in another country, unpaid work, much higher seniority, commission-only pay, or a language requirement the resume doesn't show. Empty if none.
- apply_channel: "email" if the JD asks candidates to email an address; "greenhouse", "lever" or "ashby" if the job is hosted there; otherwise "manual".
Judge only from the given text. Do not assume skills that are not shown.`;

export async function scoreJob(
  llm: LlmClient,
  input: { job: JobForPrompt; master: MasterResume; skills: ProfileSkill[]; roles: RoleType[] },
): Promise<ScoreResult> {
  const roles = input.roles.map((r) => `${r.label} (${FIELD_LABELS[r.field]})`).join("; ") || "any";
  const { data } = await llm.generate({
    purpose: "score",
    schema: ScoreResultSchema,
    system: SCORE_SYSTEM,
    content: [
      { type: "text", text: `${resumeBlock(input.master)}\n\n${skillsBlock(input.skills)}\n\n<target_roles>${roles}</target_roles>` },
      { type: "text", text: jdBlock(input.job) },
    ],
    effort: "low",
    maxTokens: 4000,
  });
  return {
    ...data,
    fit_score: Math.max(0, Math.min(100, Math.round(data.fit_score))),
    apply_channel: applyChannelFor(input.job),
  };
}

// ---------- TAILOR ----------

export function styleBlock(style: StyleRules): string {
  const rules: string[] = [];
  if (style.banEmDashes) rules.push("Never use the em dash character. Use a period or comma instead.");
  if (style.banEnDashes) rules.push("Never use the en dash character. Write ranges with 'to'.");
  if (style.shortSentences) rules.push("Write short, direct sentences. One idea per sentence. No filler.");
  if (style.noPowerVerbBullets)
    rules.push(`Do not start bullets with power verbs such as ${style.powerVerbs.slice(0, 8).join(", ")}. Start with what was built, shipped or changed.`);
  if (style.productFocused) rules.push("Use product-focused language: what was built, for whom, and the outcome.");
  if (style.bannedPhrases.length) rules.push(`Never use these phrases: ${style.bannedPhrases.map((p) => `"${p}"`).join(", ")}.`);
  if (style.extraInstructions.trim()) rules.push(style.extraInstructions.trim());
  return rules.map((r) => `- ${r}`).join("\n");
}

export const TAILOR_SYSTEM = `You tailor a candidate's master resume to one job. You return JSON describing which content to show and how to phrase it. Truthfulness rules come first and cannot be broken:

1. Never change or invent titles, companies, dates, education or years of experience. You only reference master resume entries by id.
2. Never invent metrics. Use only numbers that appear in the master resume, exactly as they appear there. If a bullet has no number, do not add one.
3. Rephrase and reorder the master bullets. You may shorten, merge or emphasize, but every claim must be supported by the master resume.
4. skills: choose the most relevant core skills from the candidate's core skill list only, best first, 8 to 14 items.
5. alsoWorkingWith: extended skills from the candidate's extended list that the job asks for. Never put a skill here that is not in that list. Empty if none apply.
6. Never mention a tool, language or skill that is in neither the skill lists nor the master resume, even if the job asks for it.

What to produce:
- summary: 2 to 3 sentences written for this role type. No first person "I". No claims beyond the resume.
- experience: for each master experience id worth showing, 2 to 5 bullets most relevant to this job, best first. Include every experience id; older or less relevant roles may get 1 to 2 bullets.
- projects: up to 3 most relevant projects by id, 1 to 3 bullets each. Empty if none are relevant.
- portfolioLinks: URLs from the master resume's portfolio links, most relevant first. For design, video and content roles this matters a lot.
- coverNote: under 120 words, plain text, addressed to the hiring team at the company. Say what role, why this candidate fits with 2 concrete facts from the resume, and a short close. No greeting cliches. Same truthfulness and style rules.

The final resume must fit on one page, so keep bullets tight (under 25 words each).`;

const TailorOutput = TailoredResumeSchema;

export async function tailorResume(
  llm: LlmClient,
  input: {
    job: JobForPrompt;
    master: MasterResume;
    skills: ProfileSkill[];
    style: StyleRules;
    field: Field;
    roleType: string;
    /** Issues from a failed validation, fed back on the one retry. */
    feedback?: string[];
  },
): Promise<TailoredResume> {
  const creative = isCreativeField(input.field);
  const extra = [
    `Role type: ${input.roleType} (${FIELD_LABELS[input.field]}).`,
    creative
      ? "This is a creative role. Put the strongest portfolio link first, and include the single most relevant portfolio URL in the cover note, copied exactly."
      : "",
    input.feedback?.length
      ? `Your previous draft failed validation. Fix every issue:\n${input.feedback.map((f) => `- ${f}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const { data } = await llm.generate({
    purpose: input.feedback?.length ? "tailor_retry" : "tailor",
    schema: TailorOutput,
    system: TAILOR_SYSTEM,
    content: [
      { type: "text", text: `${resumeBlock(input.master)}\n\n${skillsBlock(input.skills)}\n\n<style_rules>\n${styleBlock(input.style)}\n</style_rules>` },
      { type: "text", text: `${jdBlock(input.job)}\n\n${extra}` },
    ],
    effort: "medium",
    maxTokens: 8000,
  });
  return data;
}

// ---------- VALIDATE (second pass) ----------

export const ReviewSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()).describe("Each unsupported claim or rule violation, quoted. Empty if passed."),
});

export const REVIEW_SYSTEM = `You audit a tailored resume and cover note against the candidate's master resume. You are strict.

Fail the draft if any of these are true:
- A claim, responsibility, achievement, tool or number is not supported by the master resume.
- A title, company, date, degree or years of experience differs from the master resume.
- A writing style rule is broken.
- The cover note claims something not in the master resume, or makes promises (start dates, salary, availability) the resume does not support.
Rephrasing and reordering supported facts is fine. Do not fail for style preferences beyond the given rules.
Return passed=true with no issues when the draft is clean.`;

export async function reviewTailored(
  llm: LlmClient,
  input: { master: MasterResume; style: StyleRules; draft: unknown; coverNote: string },
): Promise<z.infer<typeof ReviewSchema>> {
  const { data } = await llm.generate({
    purpose: "validate",
    schema: ReviewSchema,
    system: REVIEW_SYSTEM,
    content: [
      { type: "text", text: `${resumeBlock(input.master)}\n\n<style_rules>\n${styleBlock(input.style)}\n</style_rules>` },
      { type: "text", text: `<draft_resume>\n${JSON.stringify(input.draft, null, 1)}\n</draft_resume>\n\n<cover_note>\n${input.coverNote}\n</cover_note>` },
    ],
    effort: "low",
    maxTokens: 3000,
  });
  return data;
}
