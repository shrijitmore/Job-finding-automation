import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_STYLE_RULES, type Field, type MasterResume, type ProfileSkill } from "@jfa/shared";
import { SAMPLE_RESUME } from "@jfa/core";
import type { JobForPrompt } from "./prompts";

const dir = path.join(__dirname, "..", "fixtures");

export interface JdFixture extends JobForPrompt {
  file: string;
  field: Field;
}

export function loadJds(): JdFixture[] {
  const index = JSON.parse(readFileSync(path.join(dir, "jds", "index.json"), "utf8")) as Omit<JdFixture, "description">[];
  return index.map((j) => ({ ...j, description: readFileSync(path.join(dir, "jds", j.file), "utf8") }));
}

export const CREATIVE_RESUME = JSON.parse(readFileSync(path.join(dir, "creative-resume.json"), "utf8")) as MasterResume;
export const TECH_RESUME = SAMPLE_RESUME;
export const STYLE = DEFAULT_STYLE_RULES;

export const TECH_SKILLS: ProfileSkill[] = [
  ...["TypeScript", "React", "Node.js", "PostgreSQL", "Redis", "GraphQL", "Playwright"].map((name) => ({ name, tier: "core" as const })),
  { name: "Kubernetes", tier: "extended" },
  { name: "Go", tier: "extended" },
];

export const CREATIVE_SKILLS: ProfileSkill[] = [
  ...["Adobe Premiere Pro", "After Effects", "DaVinci Resolve", "Photoshop", "Storytelling", "Sound design"].map((name) => ({ name, tier: "core" as const })),
  { name: "CapCut", tier: "extended" },
];
