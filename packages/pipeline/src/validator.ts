import { isCreativeField, type Field, type MasterResume, type ProfileSkill, type StyleRules } from "@jfa/shared";
import type { ResumeDoc } from "./document";

export interface ValidationInput {
  doc: ResumeDoc;
  coverNote: string;
  master: MasterResume;
  skills: ProfileSkill[];
  style: StyleRules;
  field: Field;
  /** JD skills the candidate does not have (from scoring). They must not appear unless the master resume mentions them. */
  missingSkills?: string[];
  /** Page count of the rendered PDF, when available. */
  pageCount?: number;
}

export const COVER_NOTE_MAX_WORDS = 120;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRe(phrase: string): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(phrase.trim())}($|[^\\p{L}\\p{N}])`, "iu");
}

/** All prose the model wrote: summary, bullets and cover note. */
export function generatedText(doc: ResumeDoc, coverNote: string): string[] {
  return [doc.summary, ...doc.experience.flatMap((e) => e.bullets), ...doc.projects.flatMap((p) => p.bullets), coverNote];
}

/** Numbers normalized so "1,200" and "1200" compare equal. */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.0+$/, ""));
}

function masterText(master: MasterResume): string {
  return JSON.stringify(master);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Deterministic checks. Returns a list of issues; empty means pass.
 * These run before the Claude review and cannot be talked out of by the model.
 */
export function validateDeterministic(input: ValidationInput): string[] {
  const { doc, coverNote, master, skills, style, field } = input;
  const issues: string[] = [];
  const texts = generatedText(doc, coverNote);
  const all = [...texts, doc.headline, ...doc.skills, ...doc.alsoWorkingWith].join("\n");

  // Style: dashes and banned phrases.
  if (style.banEmDashes && all.includes("—")) issues.push("Contains an em dash (—)");
  if (style.banEnDashes && all.includes("–")) issues.push("Contains an en dash (–)");
  for (const phrase of style.bannedPhrases) {
    if (phrase.trim() && phraseRe(phrase).test(all)) issues.push(`Uses banned phrase "${phrase}"`);
  }
  if (style.noPowerVerbBullets) {
    const verbs = style.powerVerbs.map((v) => v.toLowerCase());
    for (const b of [...doc.experience.flatMap((e) => e.bullets), ...doc.projects.flatMap((p) => p.bullets)]) {
      const first = b.trim().split(/\s+/)[0]?.replace(/[^\p{L}]/gu, "").toLowerCase();
      if (first && verbs.includes(first)) issues.push(`Bullet starts with power verb "${b.trim().split(/\s+/)[0]}"`);
    }
  }

  // Skills come only from the profile list.
  const core = new Set(skills.filter((s) => s.tier === "core").map((s) => s.name.toLowerCase()));
  const extended = new Set(skills.filter((s) => s.tier === "extended").map((s) => s.name.toLowerCase()));
  for (const s of doc.skills) if (!core.has(s.toLowerCase())) issues.push(`Skill "${s}" is not a core skill on the profile`);
  for (const s of doc.alsoWorkingWith) if (!extended.has(s.toLowerCase()) && !core.has(s.toLowerCase())) issues.push(`Skill "${s}" is not on the profile`);
  const mt = masterText(master).toLowerCase();
  const profileSkills = new Set([...core, ...extended]);
  for (const s of input.missingSkills ?? []) {
    const k = s.toLowerCase();
    if (!k || profileSkills.has(k) || mt.includes(k)) continue;
    if (texts.some((t) => phraseRe(s).test(t))) issues.push(`Mentions "${s}", which the candidate does not have`);
  }

  // Facts: every experience entry matches the master resume exactly.
  for (const e of doc.experience) {
    const m = master.experience.find((x) => x.company === e.company && x.title === e.title);
    if (!m) issues.push(`Experience "${e.title} at ${e.company}" does not match the master resume`);
    else if (e.dates !== [m.startDate, m.endDate].filter(Boolean).join(" to ")) issues.push(`Dates changed for ${e.company}`);
  }
  for (const e of doc.education) {
    if (!master.education.some((m) => m.institution === e.institution)) issues.push(`Education "${e.institution}" does not match the master resume`);
  }

  // Numbers: only numbers that already exist in the master resume.
  const allowed = new Set([...numbersIn(masterText(master)), String(master.yearsOfExperience)]);
  const invented = new Set<string>();
  for (const t of texts) for (const n of numbersIn(t)) if (!allowed.has(n)) invented.add(n);
  for (const n of invented) issues.push(`Number "${n}" does not appear in the master resume`);

  // Cover note.
  const words = wordCount(coverNote);
  if (words === 0) issues.push("Cover note is empty");
  if (words > COVER_NOTE_MAX_WORDS) issues.push(`Cover note is ${words} words, over ${COVER_NOTE_MAX_WORDS}`);
  if (isCreativeField(field) && master.portfolioLinks.length) {
    const hasLink = master.portfolioLinks.some((l) => coverNote.includes(l.url));
    if (!hasLink) issues.push("Creative role cover note must include a portfolio link");
  }

  if (input.pageCount !== undefined && input.pageCount !== 1) issues.push(`PDF is ${input.pageCount} pages, must be exactly 1`);
  return issues;
}
