import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { RunNowButton } from "@/components/RunNowButton";
import { Badge, Card, EmptyState, PageHeader, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatDuration, formatUsd } from "@/lib/format";
import { useProfile, useProfileId } from "@/lib/profile";
import type { RunRow } from "@/lib/runs";

export const RUN_TONE = { queued: "neutral", running: "blue", succeeded: "green", partial: "amber", failed: "red" } as const;

export function duration(r: Pick<RunRow, "startedAt" | "finishedAt">): number | null {
  if (!r.startedAt) return null;
  return (r.finishedAt ? new Date(r.finishedAt) : new Date()).getTime() - new Date(r.startedAt).getTime();
}

export function RunsPage() {
  const profileId = useProfileId();
  const { data: profile } = useProfile();
  const { data, isLoading } = useQuery({
    queryKey: ["runs", profileId],
    queryFn: () => api.get<RunRow[]>(`/profiles/${profileId}/runs`),
    refetchInterval: (q) => (q.state.data?.some((r) => ["queued", "running"].includes(r.status)) ? 4000 : 30_000),
  });
  if (isLoading || !data) return <PageLoader />;

  return (
    <>
      <PageHeader title="Run logs" description="Every run with timings, counts, errors, blocked sources and Claude cost." actions={profile ? <RunNowButton profileId={profileId} dryRun={profile.schedule.dryRun} /> : undefined} />
      <Card>
        {data.length === 0 ? (
          <EmptyState icon={<Activity className="size-8" />} title="No runs yet" description="Runs appear here when the schedule fires or you press Run now." />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.map((r) => (
              <li key={r.id}>
                <Link to={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 sm:px-5 dark:hover:bg-zinc-800/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge>
                      <span className="text-sm font-medium">{formatDate(r.startedAt ?? r.createdAt, true)}</span>
                      <span className="text-xs text-zinc-500">{r.trigger}</span>
                      {r.dryRun && <Badge tone="accent">dry run</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {r.stats.fetched ?? 0} fetched · {r.stats.newJobs ?? 0} new · {r.stats.scored ?? 0} scored · {(r.dryRun ? r.stats.dryRun : r.stats.applied) ?? 0} {r.dryRun ? "would apply" : "applied"} ·{" "}
                      {r.stats.manual ?? 0} manual · {formatDuration(duration(r))} · {formatUsd(r.costUsd)}
                      {r.errors.length ? <span className="text-red-600"> · {r.errors.length} errors</span> : null}
                      {r.blockedSources.length ? <span className="text-amber-600"> · {r.blockedSources.length} blocked</span> : null}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-zinc-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
