import type { MasterResume, PortfolioLink } from "@jfa/shared";

/** A form control as seen on the page. */
export interface FormField {
  idx: number;
  tag: "input" | "textarea" | "select";
  type: string;
  name: string;
  id: string;
  label: string;
  required: boolean;
  options: string[];
}

export type Answer =
  | { kind: "text"; value: string }
  | { kind: "select"; value: string }
  | { kind: "check" }
  | { kind: "resume" }
  | { kind: "skip" };

export interface AnswerContext {
  master: MasterResume;
  coverNote: string;
}

function link(master: MasterResume, ...kinds: PortfolioLink["kind"][]): string | null {
  for (const k of kinds) {
    const l = master.portfolioLinks.find((p) => p.kind === k);
    if (l) return l.url;
  }
  return null;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

/** Picks the option that best fits a number of years, e.g. "3-5 years" for 4. */
export function pickYearsOption(options: string[], years: number): string | null {
  let bestPlus: { option: string; n: number } | null = null;
  for (const o of options) {
    const range = o.match(/(\d+)\s*(?:-|to|–)\s*(\d+)/);
    if (range) {
      if (years >= Number(range[1]) && years <= Number(range[2])) return o;
      continue;
    }
    const less = o.match(/(?:less than|under|<)\s*(\d+)/i);
    if (less) {
      if (years < Number(less[1])) return o;
      continue;
    }
    const plus = o.match(/(\d+)\s*\+|(\d+) or more/i);
    if (plus) {
      const n = Number(plus[1] ?? plus[2]);
      if (years >= n && (!bestPlus || n > bestPlus.n)) bestPlus = { option: o, n };
      continue;
    }
    if (o.trim() === String(years)) return o;
  }
  return bestPlus?.option ?? null;
}

const RULES: Array<{ test: RegExp; answer: (c: AnswerContext, f: FormField) => Answer | null }> = [
  { test: /\b(resume|cv)\b/i, answer: (_c, f) => (f.type === "file" ? { kind: "resume" } : null) },
  { test: /first[\s_-]*name|given[\s_-]*name|fname/i, answer: (c) => ({ kind: "text", value: splitName(c.master.contact.name).first }) },
  { test: /last[\s_-]*name|family[\s_-]*name|surname|lname/i, answer: (c) => ({ kind: "text", value: splitName(c.master.contact.name).last }) },
  { test: /^(full[\s_-]*)?name\*?$|full[\s_-]*name|_systemfield_name|legal name/i, answer: (c) => ({ kind: "text", value: c.master.contact.name }) },
  { test: /e-?mail/i, answer: (c) => (c.master.contact.email ? { kind: "text", value: c.master.contact.email } : null) },
  { test: /phone|mobile|telephone/i, answer: (c) => (c.master.contact.phone ? { kind: "text", value: c.master.contact.phone } : null) },
  { test: /linkedin/i, answer: (c) => textOrNull(link(c.master, "linkedin")) },
  { test: /github/i, answer: (c) => textOrNull(link(c.master, "github")) },
  { test: /behance/i, answer: (c) => textOrNull(link(c.master, "behance")) },
  { test: /dribbble/i, answer: (c) => textOrNull(link(c.master, "dribbble")) },
  { test: /youtube|showreel|reel/i, answer: (c) => textOrNull(link(c.master, "youtube")) },
  { test: /instagram/i, answer: (c) => textOrNull(link(c.master, "instagram")) },
  { test: /portfolio|website|personal (site|url)|other (link|url|website)/i, answer: (c) => textOrNull(link(c.master, "website", "behance", "dribbble", "youtube", "github", "other")) },
  { test: /current (company|employer)|^company$|^org$/i, answer: (c) => textOrNull(currentJob(c.master)?.company ?? null) },
  { test: /current (title|role|position)|job title/i, answer: (c) => textOrNull(currentJob(c.master)?.title ?? null) },
  { test: /(current )?(location|city)(?! .*relocat)/i, answer: (c) => textOrNull(c.master.contact.location || null) },
  {
    test: /years? of (professional |relevant |work )?experience|how many years/i,
    answer: (c, f) => {
      const y = c.master.yearsOfExperience;
      if (!y) return null;
      if (f.tag === "select") {
        const o = pickYearsOption(f.options, y);
        return o ? { kind: "select", value: o } : null;
      }
      return { kind: "text", value: String(y) };
    },
  },
  { test: /school|university|college/i, answer: (c) => textOrNull(c.master.education[0]?.institution ?? null) },
  { test: /degree/i, answer: (c, f) => (f.tag === "select" ? null : textOrNull(c.master.education[0]?.degree ?? null)) },
  { test: /cover letter|additional information|anything else|why (do you want|are you interested)|comments/i, answer: (c, f) => (f.type === "file" ? null : textOrNull(c.coverNote || null)) },
  // Required consent boxes (privacy policy, data processing) are part of applying at all.
  { test: /privacy|terms|consent|i (agree|acknowledge|confirm that the information)/i, answer: (_c, f) => (f.type === "checkbox" ? { kind: "check" } : null) },
];

/**
 * Never answered automatically, even if a rule above would match: these need a human
 * decision or facts the profile doesn't hold.
 */
const NEEDS_HUMAN =
  /salary|compensation|pay expectation|notice period|start date|available to start|sponsor|visa|work (authori[sz]ation|permit)|legally (authori[sz]ed|eligible)|citizenship|clearance|relocat|criminal|background check|gender|race|ethnic|veteran|disabilit|pronoun|sexual orientation|date of birth|age\b|referr(ed|al)|how did you hear|salary history|cover letter.*upload/i;

function textOrNull(v: string | null): Answer | null {
  return v ? { kind: "text", value: v } : null;
}

function currentJob(master: MasterResume) {
  return master.experience.find((e) => /present|current|now/i.test(e.endDate));
}

export interface AnswerPlan {
  answers: Array<{ field: FormField; answer: Answer }>;
  /** Required fields we cannot answer truthfully. Non-empty means apply manually. */
  unanswerable: FormField[];
}

/** Decides an answer for every field. Optional fields we can't answer are left blank. */
export function planAnswers(fields: FormField[], ctx: AnswerContext): AnswerPlan {
  const answers: AnswerPlan["answers"] = [];
  const unanswerable: FormField[] = [];
  for (const f of fields) {
    let answer: Answer | null = null;
    if (!NEEDS_HUMAN.test(f.label)) {
      // Match the visible label first, then fall back to the field's name and id.
      for (const key of [f.label.trim(), `${f.name} ${f.id}`.trim()]) {
        if (!key) continue;
        for (const r of RULES) {
          if (r.test.test(key)) {
            answer = r.answer(ctx, f);
            if (answer) break;
          }
        }
        if (answer) break;
      }
    }
    if (answer) answers.push({ field: f, answer });
    else if (f.required) unanswerable.push(f);
  }
  return { answers, unanswerable };
}
