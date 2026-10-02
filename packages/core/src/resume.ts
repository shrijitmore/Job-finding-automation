import { MasterResumeSchema, type MasterResume, type PortfolioLink } from "@jfa/shared";
import type { LlmClient, LlmUsage } from "./llm";

export const RESUME_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export function detectResumeKind(filename: string, mime: string): "pdf" | "docx" | null {
  const lower = filename.toLowerCase();
  if (mime === RESUME_MIME.pdf || lower.endsWith(".pdf")) return "pdf";
  if (mime === RESUME_MIME.docx || lower.endsWith(".docx")) return "docx";
  return null;
}

/** Extracts plain text from a PDF or DOCX resume. */
export async function extractResumeText(buffer: Buffer, kind: "pdf" | "docx"): Promise<string> {
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return normalizeWhitespace(Array.isArray(text) ? text.join("\n") : text);
  }
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer });
  return normalizeWhitespace(value);
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const RESUME_PARSE_SYSTEM = `You convert resumes into a structured master resume. The candidate can work in any profession: software, AI, Web3, product, design, video editing, content creation, marketing or leadership.

Rules:
- Copy facts exactly. Never invent, infer or embellish titles, employers, dates, numbers, skills or links.
- Keep dates as written in the resume (e.g. "Jan 2021", "2019", "Present").
- Give each experience entry an id "exp-1", "exp-2"... in resume order. Projects use "proj-1"..., education "edu-1"....
- Bullets: copy each bullet's text as written, without the bullet symbol.
- metrics: list every quantified achievement verbatim (any phrase containing a number, %, $, x multiplier, follower or view count).
- skills: tools, languages, frameworks, software, platforms and methods explicitly named anywhere in the resume. Use canonical casing (e.g. "TypeScript", "Adobe Premiere Pro", "Figma"). No soft skills.
- portfolioLinks: every URL to work samples or profiles. kind is github, behance, dribbble, youtube, instagram, linkedin, website or other.
- yearsOfExperience: total professional years computed from experience dates, rounded down. 0 if it cannot be determined.
- Use empty strings or empty arrays for anything not present.`;

export async function parseResume(
  llm: LlmClient,
  input: { text: string; pdfBase64?: string },
): Promise<{ resume: MasterResume; usage: LlmUsage }> {
  const content = input.pdfBase64
    ? [
        { type: "pdf" as const, base64: input.pdfBase64 },
        { type: "text" as const, text: `Extracted text of the same resume, for reference:\n\n${input.text}` },
      ]
    : [{ type: "text" as const, text: `Resume:\n\n${input.text}` }];
  const { data, usage } = await llm.generate({
    purpose: "resume_parse",
    schema: MasterResumeSchema,
    system: RESUME_PARSE_SYSTEM,
    content,
    effort: "low",
  });
  return { resume: normalizeMasterResume(data), usage };
}

const PORTFOLIO_HOSTS: Array<[RegExp, PortfolioLink["kind"]]> = [
  [/github\.com/i, "github"],
  [/behance\.net/i, "behance"],
  [/dribbble\.com/i, "dribbble"],
  [/youtube\.com|youtu\.be/i, "youtube"],
  [/instagram\.com/i, "instagram"],
  [/linkedin\.com/i, "linkedin"],
];

export function portfolioKindFor(url: string): PortfolioLink["kind"] {
  return PORTFOLIO_HOSTS.find(([re]) => re.test(url))?.[1] ?? "website";
}

/** Cleans parser output: unique ids, trimmed strings, de-duplicated skills and links. */
export function normalizeMasterResume(r: MasterResume): MasterResume {
  const seen = new Set<string>();
  const uniq = (id: string, prefix: string, i: number) => {
    let out = id?.trim() || `${prefix}-${i + 1}`;
    while (seen.has(out)) out = `${out}-x`;
    seen.add(out);
    return out;
  };
  const dedupe = (xs: string[]) => {
    const map = new Map<string, string>();
    for (const x of xs.map((s) => s.trim()).filter(Boolean)) if (!map.has(x.toLowerCase())) map.set(x.toLowerCase(), x);
    return [...map.values()];
  };
  const links = new Map<string, PortfolioLink>();
  for (const l of r.portfolioLinks) {
    const url = l.url.trim();
    if (!url) continue;
    links.set(url.toLowerCase(), { kind: l.kind ?? portfolioKindFor(url), url, label: l.label?.trim() ?? "" });
  }
  return {
    ...r,
    summary: r.summary.trim(),
    yearsOfExperience: Math.max(0, Math.floor(r.yearsOfExperience || 0)),
    experience: r.experience.map((e, i) => ({ ...e, id: uniq(e.id, "exp", i), bullets: e.bullets.map((b) => b.trim()).filter(Boolean) })),
    projects: r.projects.map((p, i) => ({ ...p, id: uniq(p.id, "proj", i), bullets: p.bullets.map((b) => b.trim()).filter(Boolean), skills: dedupe(p.skills) })),
    education: r.education.map((e, i) => ({ ...e, id: uniq(e.id, "edu", i) })),
    skills: dedupe(r.skills),
    metrics: dedupe(r.metrics),
    certifications: dedupe(r.certifications),
    portfolioLinks: [...links.values()],
  };
}

/** Skills mentioned in the resume that are not yet in the profile's skill list. */
export function suggestSkills(resume: MasterResume | null, existing: string[]): string[] {
  if (!resume) return [];
  const have = new Set(existing.map((s) => s.toLowerCase()));
  const out = new Map<string, string>();
  for (const s of [...resume.skills, ...resume.projects.flatMap((p) => p.skills)]) {
    const k = s.trim().toLowerCase();
    if (k && !have.has(k) && !out.has(k)) out.set(k, s.trim());
  }
  return [...out.values()];
}
