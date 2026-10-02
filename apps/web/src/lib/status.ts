import type { ApplicationStatus } from "@jfa/shared";
import type { Tone } from "@/components/ui";

export const STATUS_META: Record<ApplicationStatus, { label: string; tone: Tone }> = {
  scored: { label: "Scored", tone: "neutral" },
  tailored: { label: "Tailored", tone: "blue" },
  ready: { label: "Ready", tone: "blue" },
  validation_failed: { label: "Validation failed", tone: "amber" },
  dry_run: { label: "Dry run", tone: "accent" },
  applied: { label: "Applied", tone: "green" },
  manual_apply: { label: "Manual apply", tone: "amber" },
  skipped: { label: "Skipped", tone: "neutral" },
  failed: { label: "Failed", tone: "red" },
  replied: { label: "Replied", tone: "blue" },
  interview: { label: "Interview", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

export const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  greenhouse: "Greenhouse form",
  lever: "Lever form",
  ashby: "Ashby form",
  manual: "Manual",
};

export function scoreTone(score: number | null | undefined): Tone {
  if (score == null) return "neutral";
  if (score >= 85) return "green";
  if (score >= 70) return "blue";
  if (score >= 50) return "amber";
  return "red";
}
