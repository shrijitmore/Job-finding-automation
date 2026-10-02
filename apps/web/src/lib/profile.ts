import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import { api } from "./api";
import type { Profile } from "./types";

export function useProfileId(): string {
  const { profileId } = useParams();
  if (!profileId) throw new Error("No profile in route");
  return profileId;
}

export function useProfile() {
  const id = useProfileId();
  return useQuery({ queryKey: ["profile", id], queryFn: () => api.get<Profile>(`/profiles/${id}`) });
}

export function useSaveProfile() {
  const id = useProfileId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<Profile, "name" | "masterResume" | "preferences" | "schedule" | "styleRules">> & { onboarded?: boolean }) =>
      api.patch<Profile>(`/profiles/${id}`, patch),
    onSuccess: (p) => {
      qc.setQueryData(["profile", id], p);
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
