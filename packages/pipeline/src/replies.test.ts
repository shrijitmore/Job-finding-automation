import { FakeLlm } from "@jfa/core";
import { describe, expect, it } from "vitest";
import { pipelineFakeHandlers } from "./fake";
import { REPLY_SYSTEM, classifyReply, portfolioReply, resumeReply } from "./replies";
import { CREATIVE_RESUME, TECH_RESUME } from "./test-fixtures";

describe("reply handling", () => {
  it("forbids committing to times, salary numbers or deadlines in drafts", () => {
    expect(REPLY_SYSTEM).toMatch(/Never agree to or propose specific interview times/);
    expect(REPLY_SYSTEM).toMatch(/Never state a salary number/);
    expect(REPLY_SYSTEM).toMatch(/Never accept an assessment deadline/);
  });

  it("strips dashes from model drafts", async () => {
    const llm = new FakeLlm({ ...pipelineFakeHandlers(), reply_classify: () => ({ category: "other", confidence: 1, summary: "x", suggested_reply: "Thanks — talk soon – Jane" }) });
    const r = await classifyReply(llm, { text: "hi", subject: "s", from: "a@b.co", jobTitle: "Editor", company: "Acme", master: TECH_RESUME });
    expect(r.suggested_reply).not.toMatch(/[–—]/);
  });

  it("uses fixed templates for auto-replies with only master resume links", () => {
    expect(resumeReply(TECH_RESUME)).toContain("My resume is attached");
    const p = portfolioReply(CREATIVE_RESUME)!;
    expect(p).toContain("https://youtube.com/@ravicuts");
    expect(p).toContain("https://behance.net/ravikumar");
    expect(p).toMatch(/Ravi$/);
    expect(portfolioReply({ ...TECH_RESUME, portfolioLinks: [] })).toBeNull();
  });
});
