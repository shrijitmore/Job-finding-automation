import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Badge, Card, CardHeader, PageLoader, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatDuration, formatUsd } from "@/lib/format";
import { useProfileId } from "@/lib/profile";
import type { RunRow } from "@/lib/runs";
import { RUN_TONE, duration } from "./Runs";

interface RunEvent {
  id: string;
  level: "info" | "warn" | "error";
  step: string;
  message: string;
  data: Record<string, unknown> | null;
  createdAt: string;
}

const STEPS = ["replies", "fetch", "filter", "score", "tailor", "apply", "notify"];
const LEVEL_CLASS = { info: "text-zinc-500", warn: "text-amber-600", error: "text-red-600" };

export function RunDetailPage() {
  const profileId = useProfileId();
  const { runId } = useParams();
  const [level, setLevel] = useState<"all" | "warn" | "error">("all");
  const { data, isLoading } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.get<{ run: RunRow; events: RunEvent[] }>(`/profiles/${profileId}/runs/${runId}`),
    refetchInterval: (q) => (q.state.data && ["queued", "running"].includes(q.state.data.run.status) ? 3000 : false),
  });
  if (isLoading || !data) return <PageLoader />;
  const { run, events } = data;
  const maxStep = Math.max(1, ...STEPS.map((s) => run.timings[s] ?? 0));
  const summary = events.find((e) => e.step === "notify" && e.data?.summary)?.data?.summary as string | undefined;
  const visible = events.filter((e) => level === "all" || (level === "warn" ? e.level !== "info" : e.level === "error"));

  return (
    <>
      <Link to=".." relative="path" className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        <ArrowLeft className="size-4" /> Run logs
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Run {formatDate(run.startedAt ?? run.createdAt, true)}</h1>
        <Badge tone={RUN_TONE[run.status]}>{run.status}</Badge>
        <Badge>{run.trigger}</Badge>
        {run.dryRun && <Badge tone="accent">dry run</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Duration" value={formatDuration(duration(run))} hint={`cap ${run.applyCap} this run`} />
        <Stat label={run.dryRun ? "Would apply" : "Applied"} value={(run.dryRun ? run.stats.dryRun : run.stats.applied) ?? 0} hint={`${run.stats.manual ?? 0} manual · ${run.stats.failed ?? 0} failed`} />
        <Stat label="Jobs" value={run.stats.fetched ?? 0} hint={`${run.stats.newJobs ?? 0} new · ${run.stats.filtered ?? 0} passed filters`} />
        <Stat label="Claude cost" value={formatUsd(run.costUsd)} hint={`${(run.inputTokens + run.outputTokens).toLocaleString()} tokens`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Step timings" />
          <ul className="space-y-2 p-4 sm:p-5">
            {STEPS.map((s) => (
              <li key={s} className="grid grid-cols-[5rem_1fr_4rem] items-center gap-3 text-sm">
                <span className="capitalize text-zinc-500">{s}</span>
                <span className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <span className="block h-full rounded-full bg-accent-500" style={{ width: `${((run.timings[s] ?? 0) / maxStep) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{run.timings[s] != null ? formatDuration(Math.max(1000, run.timings[s])) : "—"}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Counts" />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 p-4 text-sm sm:p-5">
            {(
              [
                ["Replies processed", run.stats.repliesProcessed],
                ["Fetched", run.stats.fetched],
                ["New jobs", run.stats.newJobs],
                ["Passed filters", run.stats.filtered],
                ["Scored", run.stats.scored],
                ["Shortlisted", run.stats.shortlisted],
                ["Tailored", run.stats.tailored],
                ["Validation failed", run.stats.validationFailed],
                ["Applied", run.stats.applied],
                ["Dry run", run.stats.dryRun],
                ["Manual", run.stats.manual],
                ["Failed", run.stats.failed],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-zinc-500">{k}</dt>
                <dd className="tabular-nums font-medium">{v ?? 0}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {(run.blockedSources.length > 0 || run.errors.length > 0) && (
        <Card className="mt-5">
          <CardHeader title="Problems" />
          <div className="space-y-3 p-4 text-sm sm:p-5">
            {run.blockedSources.length > 0 && (
              <p>
                <span className="font-medium text-amber-600">Blocked sources:</span> {run.blockedSources.join(", ")}
              </p>
            )}
            {run.errors.map((e, i) => (
              <p key={i} className="text-red-600 dark:text-red-400">
                <span className="font-medium">{e.step}{e.source ? ` (${e.source})` : ""}:</span> {e.message}
              </p>
            ))}
          </div>
        </Card>
      )}

      {summary && (
        <Card className="mt-5">
          <CardHeader title="Summary sent to Telegram" />
          <pre className="overflow-x-auto whitespace-pre-wrap p-4 text-xs leading-relaxed sm:p-5">{new DOMParser().parseFromString(summary, "text/html").body.textContent}</pre>
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader
          title={`Events (${events.length})`}
          actions={
            <div className="flex gap-1 text-xs">
              {(["all", "warn", "error"] as const).map((l) => (
                <button key={l} onClick={() => setLevel(l)} className={`rounded-md px-2 py-1 ${level === l ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                  {l === "warn" ? "warnings" : l === "error" ? "errors" : "all"}
                </button>
              ))}
            </div>
          }
        />
        <ol className="max-h-[32rem] divide-y divide-zinc-100 overflow-y-auto font-mono text-xs dark:divide-zinc-800">
          {visible.map((e) => (
            <li key={e.id} className="grid grid-cols-[4.5rem_4.5rem_1fr] gap-2 px-4 py-1.5 sm:px-5">
              <span className="text-zinc-400">{new Date(e.createdAt).toLocaleTimeString()}</span>
              <span className={LEVEL_CLASS[e.level]}>{e.step}</span>
              <span className="break-words">{e.message}</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
