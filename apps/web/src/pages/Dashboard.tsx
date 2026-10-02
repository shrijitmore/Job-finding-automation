import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Briefcase, FlaskConical } from "lucide-react";
import { Link } from "react-router";
import { RunNowButton } from "@/components/RunNowButton";
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageLoader, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { formatUsd, timeAgo } from "@/lib/format";
import { useProfile, useProfileId } from "@/lib/profile";
import type { RunRow } from "@/lib/runs";
import { CHANNEL_LABEL, STATUS_META, scoreTone } from "@/lib/status";
import type { ApplicationListItem, ApplicationList } from "./Applications";

interface DashboardData {
  dryRun: boolean;
  appliedToday: number;
  appliedWeek: number;
  dryRunToday: number;
  dryRunWeek: number;
  responseRate: number;
  interviews: number;
  manualPending: number;
  dailyCap: number;
  costWeekUsd: number;
  lastRun: RunRow | null;
}

const RUN_TONE = { queued: "neutral", running: "blue", succeeded: "green", partial: "amber", failed: "red" } as const;

export function DashboardPage() {
  const profileId = useProfileId();
  const { data: profile } = useProfile();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", profileId],
    queryFn: () => api.get<DashboardData>(`/profiles/${profileId}/dashboard`),
    refetchInterval: (q) => (q.state.data?.lastRun && ["queued", "running"].includes(q.state.data.lastRun.status) ? 5000 : 30_000),
  });
  const recent = useQuery({
    queryKey: ["applications", profileId, "recent"],
    queryFn: () => api.get<ApplicationList>(`/profiles/${profileId}/applications?pageSize=8&status=applied,dry_run,manual_apply,interview,replied,validation_failed,failed`),
  });

  if (isLoading || !data) return <PageLoader />;
  const needsSetup = !profile?.masterResume || !profile.preferences.roleTypeIds.length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          data.dryRun ? (
            <span className="inline-flex items-center gap-1.5">
              <FlaskConical className="size-4" /> Dry run is on. Nothing is sent; would-be applications appear below.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
              <AlertTriangle className="size-4" /> Live mode. Applications are really sent.
            </span>
          )
        }
        actions={<RunNowButton profileId={profileId} dryRun={data.dryRun} />}
      />

      {needsSetup && (
        <Card className="mb-5 border-l-4 border-amber-400 p-4 text-sm">
          Finish setup first: {!profile?.masterResume && <Link className="font-medium text-accent-600 underline" to="../resume">save your resume</Link>}
          {!profile?.masterResume && !profile?.preferences.roleTypeIds.length && " and "}
          {!profile?.preferences.roleTypeIds.length && <Link className="font-medium text-accent-600 underline" to="../preferences">pick role types</Link>}.
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Applied today" value={data.appliedToday} hint={data.dryRun ? `${data.dryRunToday} in dry run · cap ${data.dailyCap}` : `cap ${data.dailyCap}`} />
        <Stat label="This week" value={data.appliedWeek} hint={data.dryRun ? `${data.dryRunWeek} in dry run` : undefined} />
        <Stat label="Response rate" value={`${Math.round(data.responseRate * 100)}%`} hint={`${data.manualPending} waiting for manual apply`} />
        <Stat label="Interviews flagged" value={data.interviews} hint={`${formatUsd(data.costWeekUsd)} Claude cost this week`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent applications"
            actions={
              <Link to="../applications" className="inline-flex items-center gap-1 text-sm font-medium text-accent-600 hover:underline">
                All <ArrowRight className="size-4" />
              </Link>
            }
          />
          {recent.data?.items.length ? (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {recent.data.items.map((a: ApplicationListItem) => (
                <li key={a.id}>
                  <Link to={`../applications/${a.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 sm:px-5 dark:hover:bg-zinc-800/40">
                    <Badge tone={scoreTone(a.fitScore)} className="w-9 justify-center tabular-nums">
                      {a.fitScore ?? "–"}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.job.title}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {a.job.company} · {CHANNEL_LABEL[a.applyChannel ?? "manual"]} · {timeAgo(a.updatedAt)}
                      </p>
                    </div>
                    <Badge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Briefcase className="size-8" />} title="No applications yet" description="Press Run now to fetch, score and tailor your first batch." />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Last run"
            actions={
              <Link to="../runs" className="text-sm font-medium text-accent-600 hover:underline">
                Logs
              </Link>
            }
          />
          {data.lastRun ? (
            <div className="space-y-3 p-4 text-sm sm:p-5">
              <div className="flex items-center gap-2">
                <Badge tone={RUN_TONE[data.lastRun.status]}>{data.lastRun.status}</Badge>
                <span className="text-zinc-500">
                  {data.lastRun.trigger} · {timeAgo(data.lastRun.startedAt ?? data.lastRun.createdAt)}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {(
                  [
                    ["Fetched", data.lastRun.stats.fetched],
                    ["New jobs", data.lastRun.stats.newJobs],
                    ["Passed filters", data.lastRun.stats.filtered],
                    ["Scored", data.lastRun.stats.scored],
                    ["Tailored", data.lastRun.stats.tailored],
                    [data.lastRun.dryRun ? "Would apply" : "Applied", data.lastRun.dryRun ? data.lastRun.stats.dryRun : data.lastRun.stats.applied],
                    ["Manual", data.lastRun.stats.manual],
                    ["Cost", formatUsd(data.lastRun.costUsd)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-zinc-500">{k}</dt>
                    <dd className="font-medium tabular-nums">{v ?? 0}</dd>
                  </div>
                ))}
              </dl>
              {data.lastRun.errors.length > 0 && <p className="text-xs text-red-600">{data.lastRun.errors.length} errors</p>}
            </div>
          ) : (
            <EmptyState title="No runs yet" />
          )}
        </Card>
      </div>
    </>
  );
}
