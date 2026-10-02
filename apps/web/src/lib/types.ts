import type { MasterResume, Preferences, Schedule, StyleRules } from "@jfa/shared";

export interface SessionUser {
  id: string;
  email: string;
}

export interface AuthStatus {
  hasOwner: boolean;
  setupAllowed: boolean;
  user: SessionUser | null;
}

export interface ProfileSummary {
  id: string;
  name: string;
  onboarded: boolean;
  dryRun: boolean;
  enabled: boolean;
  createdAt: string;
}

export interface Profile {
  id: string;
  name: string;
  masterResume: MasterResume | null;
  resumeFileKey: string | null;
  preferences: Preferences;
  schedule: Schedule;
  styleRules: StyleRules;
  onboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
