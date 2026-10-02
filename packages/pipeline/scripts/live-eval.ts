/**
 * Runs the real scoring and tailoring prompts against every fixture JD with Claude.
 * Costs real money, so it never runs in CI. Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @jfa/pipeline eval:live
 */
import { writeFileSync } from "node:fs";
import { ClaudeLlm, type LlmUsage } from "@jfa/core";
import { ROLE_CATALOG } from "@jfa/shared";
import { PdfRenderer } from "../src/pdf";
import { scoreJob } from "../src/prompts";
import { tailorAndValidate } from "../src/tailor-flow";
import { CREATIVE_RESUME, CREATIVE_SKILLS, STYLE, TECH_RESUME, TECH_SKILLS, loadJds } from "../src/test-fixtures";

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Set ANTHROPIC_API_KEY to run the live eval");
  const usage: LlmUsage[] = [];
  const llm = new ClaudeLlm({ apiKey, model: process.env.CLAUDE_MODEL, onUsage: (u) => void usage.push(u) });
  const renderer = new PdfRenderer();
  const rows: string[] = [];
  for (const jd of loadJds()) {
    const creative = ["video", "content", "design"].includes(jd.field);
    const master = creative ? CREATIVE_RESUME : TECH_RESUME;
    const skills = creative ? CREATIVE_SKILLS : TECH_SKILLS;
    const roles = ROLE_CATALOG.filter((r) => r.field === jd.field).slice(0, 3);
    const score = await scoreJob(llm, { job: jd, master, skills, roles });
    const out = await tailorAndValidate(llm, renderer, { job: jd, master, skills, style: STYLE, field: jd.field, roleType: score.role_type, missingSkills: score.missing_skills });
    if (out.pdf) writeFileSync(`live-eval-${jd.file.replace(".txt", "")}.pdf`, out.pdf);
    rows.push(`${jd.file.padEnd(24)} score=${String(score.fit_score).padStart(3)} valid=${out.ok} attempts=${out.attempts} ${out.issues.join("; ")}`);
  }
  await renderer.close();
  console.log(rows.join("\n"));
  const cost = usage.reduce((s, u) => s + u.costUsd, 0);
  console.log(`\n${usage.length} Claude calls, $${cost.toFixed(4)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
