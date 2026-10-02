import type { TailoredResume } from "@jfa/shared";
import { afterAll, describe, expect, it } from "vitest";
import { assembleResume } from "./document";
import { PdfRenderer, countPdfPages } from "./pdf";
import { renderResumeHtml } from "./templates";
import { CREATIVE_RESUME, CREATIVE_SKILLS, TECH_RESUME, TECH_SKILLS } from "./test-fixtures";

const tailored = (master: typeof TECH_RESUME): TailoredResume => ({
  summary: master.summary,
  experience: master.experience.map((e) => ({ id: e.id, bullets: e.bullets })),
  projects: master.projects.map((p) => ({ id: p.id, bullets: p.bullets })),
  skills: master.skills,
  alsoWorkingWith: [],
  portfolioLinks: master.portfolioLinks.map((l) => l.url),
  coverNote: "",
});

describe("templates", () => {
  it("puts portfolio links near the top for creative roles", () => {
    const html = renderResumeHtml(assembleResume(CREATIVE_RESUME, tailored(CREATIVE_RESUME), CREATIVE_SKILLS, "video"));
    expect(html.indexOf("Portfolio")).toBeLessThan(html.indexOf("Experience"));
    expect(html).toContain("behance.net/ravikumar");
  });

  it("escapes HTML", () => {
    const doc = assembleResume({ ...TECH_RESUME, summary: "<script>x</script>" }, { ...tailored(TECH_RESUME), summary: "<b>hi</b>" }, TECH_SKILLS, "engineering");
    expect(renderResumeHtml(doc)).toContain("&lt;b&gt;hi&lt;/b&gt;");
  });
});

describe("PdfRenderer", () => {
  const renderer = new PdfRenderer();
  afterAll(() => renderer.close());

  it("renders each template to exactly one page", async () => {
    for (const [master, skills, field] of [
      [TECH_RESUME, TECH_SKILLS, "engineering"],
      [CREATIVE_RESUME, CREATIVE_SKILLS, "video"],
      [TECH_RESUME, TECH_SKILLS, "product"],
    ] as const) {
      const out = await renderer.renderResume(assembleResume(master, tailored(master), skills, field));
      expect(out.pdf.subarray(0, 4).toString()).toBe("%PDF");
      expect(out.pageCount).toBe(1);
    }
  });

  it("shrinks type to fit, and reports page count when it cannot", async () => {
    const long = { ...TECH_RESUME, experience: TECH_RESUME.experience.map((e) => ({ ...e, bullets: Array(6).fill("Built a checkout flow in React and TypeScript used by 2M monthly users across many markets and devices") })) };
    const doc = assembleResume(long, tailored(long), TECH_SKILLS, "engineering");
    doc.experience = [...doc.experience, ...doc.experience, ...doc.experience];
    const out = await renderer.renderResume(doc);
    expect(out.scale).toBeLessThan(1);
    expect(await countPdfPages(out.pdf)).toBe(out.pageCount);
  });
});
