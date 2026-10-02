import type { LlmClient } from "@jfa/core";
import type { Profile, ProfileSkillRow, Run } from "@jfa/db";
import type { ProfileSkill } from "@jfa/shared";
import type { Mailer } from "../mail/mailer";
import type { RunLogger } from "./run-logger";

/** Everything a step needs about the run in progress. Built once per run. */
export interface RunContext {
  run: Run;
  profile: Profile;
  userId: string;
  skills: ProfileSkill[];
  llm: LlmClient | null;
  mailer: Mailer | null;
  log: RunLogger;
  now: Date;
  /** Applications this run may make (daily cap split across runs, minus today's usage). */
  cap: number;
}

export function toSkills(rows: ProfileSkillRow[]): ProfileSkill[] {
  return rows.map((r) => ({ name: r.name, tier: r.tier }));
}
