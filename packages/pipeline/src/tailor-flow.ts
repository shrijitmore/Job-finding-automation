import type { LlmClient } from "@jfa/core";
import type { Field, MasterResume, ProfileSkill, StyleRules, TailoredResume } from "@jfa/shared";
import { assembleResume, type ResumeDoc } from "./document";
import type { PdfRenderer } from "./pdf";
import { reviewTailored, tailorResume, type JobForPrompt } from "./prompts";
import { validateDeterministic } from "./validator";

export interface TailorInput {
  job: JobForPrompt;
  master: MasterResume;
  skills: ProfileSkill[];
  style: StyleRules;
  field: Field;
  roleType: string;
  missingSkills: string[];
}

export interface TailorOutcome {
  ok: boolean;
  attempts: number;
  issues: string[];
  tailored?: TailoredResume;
  doc?: ResumeDoc;
  coverNote?: string;
  pdf?: Buffer;
  pageCount?: number;
}

/**
 * TAILOR then VALIDATE: deterministic checks first, then a Claude review. On failure the
 * draft is regenerated once with the issues as feedback; a second failure skips the job.
 */
export async function tailorAndValidate(llm: LlmClient, renderer: Pick<PdfRenderer, "renderResume">, input: TailorInput): Promise<TailorOutcome> {
  let feedback: string[] | undefined;
  let last: TailorOutcome = { ok: false, attempts: 0, issues: [] };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const tailored = await tailorResume(llm, { ...input, feedback });
    const doc = assembleResume(input.master, tailored, input.skills, input.field);
    const coverNote = tailored.coverNote.trim();
    const { pdf, pageCount } = await renderer.renderResume(doc);
    let issues = validateDeterministic({ doc, coverNote, master: input.master, skills: input.skills, style: input.style, field: input.field, missingSkills: input.missingSkills, pageCount });
    if (!issues.length) {
      const review = await reviewTailored(llm, { master: input.master, style: input.style, draft: doc, coverNote });
      if (!review.passed) issues = review.issues.length ? review.issues : ["Reviewer rejected the draft"];
    }
    last = { ok: issues.length === 0, attempts: attempt, issues, tailored, doc, coverNote, pdf, pageCount };
    if (last.ok) return last;
    feedback = issues;
  }
  return last;
}
