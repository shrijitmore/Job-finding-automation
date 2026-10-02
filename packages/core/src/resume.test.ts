import { readFileSync } from "node:fs";
import path from "node:path";
import { MasterResumeSchema } from "@jfa/shared";
import { describe, expect, it } from "vitest";
import { FakeLlm } from "./fake-llm";
import { SAMPLE_RESUME } from "./fixtures";
import { detectResumeKind, extractResumeText, normalizeMasterResume, parseResume, portfolioKindFor, suggestSkills } from "./resume";

const fixture = (name: string) => readFileSync(path.join(__dirname, "..", "test-fixtures", name));

describe("resume extraction", () => {
  it("detects file kinds", () => {
    expect(detectResumeKind("cv.PDF", "application/octet-stream")).toBe("pdf");
    expect(detectResumeKind("cv.docx", "")).toBe("docx");
    expect(detectResumeKind("cv.txt", "text/plain")).toBeNull();
  });

  it("extracts text from a PDF", async () => {
    const text = await extractResumeText(fixture("resume.pdf"), "pdf");
    expect(text).toContain("Jane Doe");
    expect(text).toContain("Cut API latency by 40%");
  });

  it("extracts text from a DOCX", async () => {
    const text = await extractResumeText(fixture("resume.docx"), "docx");
    expect(text).toContain("Lead Video Editor, Northwind Media");
    expect(text).toContain("30M total views");
  });
});

describe("parseResume", () => {
  it("sends the PDF and text, then normalizes the result", async () => {
    const llm = new FakeLlm({
      resume_parse: () => ({
        ...SAMPLE_RESUME,
        skills: ["React", "react", " TypeScript "],
        experience: [SAMPLE_RESUME.experience[0], { ...SAMPLE_RESUME.experience[1], id: "exp-1" }],
      }),
    });
    const { resume, usage } = await parseResume(llm, { text: "Jane Doe resume", pdfBase64: "AAAA" });
    expect(MasterResumeSchema.parse(resume)).toBeTruthy();
    expect(resume.skills).toEqual(["React", "TypeScript"]);
    expect(new Set(resume.experience.map((e) => e.id)).size).toBe(2);
    expect(llm.calls[0].text).toContain("[pdf]");
    expect(usage.purpose).toBe("resume_parse");
  });
});

describe("helpers", () => {
  it("classifies portfolio links", () => {
    expect(portfolioKindFor("https://www.behance.net/jane")).toBe("behance");
    expect(portfolioKindFor("https://youtu.be/abc")).toBe("youtube");
    expect(portfolioKindFor("https://jane.design")).toBe("website");
  });

  it("suggests skills not already on the profile", () => {
    expect(suggestSkills(SAMPLE_RESUME, ["typescript", "React"])).toEqual(
      expect.arrayContaining(["Node.js", "Next.js", "Prisma"]),
    );
    expect(suggestSkills(SAMPLE_RESUME, ["typescript"])).not.toContain("TypeScript");
  });

  it("drops empty links and bullets", () => {
    const r = normalizeMasterResume({
      ...SAMPLE_RESUME,
      portfolioLinks: [{ kind: "other", url: " ", label: "" }, ...SAMPLE_RESUME.portfolioLinks],
      experience: [{ ...SAMPLE_RESUME.experience[0], bullets: ["", " a "] }],
    });
    expect(r.portfolioLinks).toHaveLength(2);
    expect(r.experience[0].bullets).toEqual(["a"]);
  });
});
