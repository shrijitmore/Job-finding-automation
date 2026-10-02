import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface RunRow {
  id: string;
  trigger: "schedule" | "manual";
  status: "queued" | "running" | "succeeded" | "failed" | "partial";
  dryRun: boolean;
  applyCap: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  stats: Partial<Record<"fetched" | "newJobs" | "filtered" | "scored" | "shortlisted" | "tailored" | "validationFailed" | "applied" | "dryRun" | "manual" | "skipped" | "failed" | "repliesProcessed", number>>;
  timings: Record<string, number>;
  errors: Array<{ step: string; source?: string; message: string }>;
  blockedSources: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
}

export function useRunNow(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RunRow>(`/profiles/${profileId}/runs`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runs", profileId] });
      qc.invalidateQueries({ queryKey: ["dashboard", profileId] });
    },
  });
}
