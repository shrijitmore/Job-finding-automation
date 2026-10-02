import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApplicationStatus, ScoreResult, TailoredResume } from "@jfa/shared";
import { ArrowLeft, CheckCircle2, Download, ExternalLink, Mail, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Badge, Button, Card, CardHeader, PageLoader } from "@/components/ui";
import { api, fileUrl } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useProfileId } from "@/lib/profile";
import { CHANNEL_LABEL, STATUS_META, scoreTone } from "@/lib/status";

interface Detail {
  id: string;
  status: ApplicationStatus;
  fitScore: number | null;
  score: ScoreResult | null;
  roleType: string | null;
  template: string | null;
  tailored: TailoredResume | null;
  coverNote: string | null;
  applyChannel: string | null;
  applyTarget: string | null;
  validation: { passed: boolean; attempts: number; issues: string[]; pageCount?: number } | null;
  skipReason: string | null;
  error: string | null;
  appliedAt: string | null;
  createdAt: string;
  hasPdf: boolean;
  hasScreenshot: boolean;
  job: { title: string; company: string; location: string; url: string; description: string; postedAt: string | null; applyUrl: string | null; applyEmail: string | null };
  source: { name: string } | null;
  replies: Array<{ id: string; fromAddress: string; subject: string; category: string | null; receivedAt: string; summary: string | null }>;
}

const TABS = ["Resume", "Cover note", "Fit", "Job description"] as const;

export function ApplicationDetailPage() {
  const profileId = useProfileId();
  const { appId } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resume");
  const { data: a, isLoading } = useQuery({
    queryKey: ["application", appId],
    queryFn: () => api.get<Detail>(`/profiles/${profileId}/applications/${appId}`),
  });
  const mark = useMutation({
    mutationFn: (status: "applied" | "skipped" | "interview" | "rejected") => api.patch(`/profiles/${profileId}/applications/${appId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["application", appId] });
      qc.invalidateQueries({ queryKey: ["applications", profileId] });
    },
  });

  if (isLoading || !a) return <PageLoader />;
  const pdf = fileUrl(`/profiles/${profileId}/applications/${a.id}/pdf`);
  const target = a.applyTarget ?? a.job.applyUrl ?? a.job.url;

  return (
    <>
      <Link to=".." relative="path" className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        <ArrowLeft className="size-4" /> Applications
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{a.job.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {a.job.company}
            {a.job.location ? ` · ${a.job.location}` : ""}
            {a.source ? ` · via ${a.source.name}` : ""}
            {a.job.postedAt ? ` · posted ${formatDate(a.job.postedAt)}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</Badge>
            <Badge tone={scoreTone(a.fitScore)}>Fit {a.fitScore ?? "–"}</Badge>
            <Badge>{CHANNEL_LABEL[a.applyChannel ?? "manual"]}</Badge>
            {a.roleType && <Badge>{a.roleType}</Badge>}
            {a.template && <Badge>{a.template} template</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={a.job.url} target="_blank" rel="noreferrer">
            <Button variant="secondary" icon={<ExternalLink className="size-4" />}>
              Job post
            </Button>
          </a>
          {a.hasPdf && (
            <a href={`${pdf}?download=1`}>
              <Button variant="secondary" icon={<Download className="size-4" />}>
                PDF
              </Button>
            </a>
          )}
        </div>
      </div>

      {a.status === "manual_apply" && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 border-l-4 border-amber-400 p-4">
          <div className="text-sm">
            <p className="font-medium">Apply manually</p>
            <p className="text-zinc-500">{a.skipReason ?? "This job uses a form we don't fill automatically."} Your tailored resume and cover note are ready below.</p>
          </div>
          <div className="flex gap-2">
            <a href={target} target="_blank" rel="noreferrer">
              <Button icon={<ExternalLink className="size-4" />}>Open application</Button>
            </a>
            <Button variant="secondary" loading={mark.isPending} onClick={() => mark.mutate("applied")}>
              Mark as applied
            </Button>
          </div>
        </Card>
      )}
      {a.status === "dry_run" && (
        <Card className="mb-5 border-l-4 border-accent-500 p-4 text-sm">
          <p className="font-medium">Dry run</p>
          <p className="text-zinc-500">
            Would have applied via {CHANNEL_LABEL[a.applyChannel ?? "manual"]} to <span className="font-medium text-zinc-700 dark:text-zinc-300">{target}</span>. Nothing was sent.
          </p>
        </Card>
      )}
      {(a.skipReason || a.error) && !["manual_apply"].includes(a.status) && (
        <Card className="mb-5 border-l-4 border-red-400 p-4 text-sm">
          <p className="font-medium">{a.error ? "Error" : "Skipped"}</p>
          <p className="text-zinc-500">{a.error ?? a.skipReason}</p>
        </Card>
      )}

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-white shadow-sm dark:bg-zinc-800" : "text-zinc-500"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Resume" &&
        (a.hasPdf ? (
          <Card className="overflow-hidden">
            <iframe title="Tailored resume" src={pdf} className="h-[75vh] w-full bg-white" />
          </Card>
        ) : (
          <Card className="p-6 text-sm text-zinc-500">No tailored resume for this job{a.status === "skipped" ? " because it was skipped" : ""}.</Card>
        ))}

      {tab === "Cover note" && (
        <Card>
          <CardHeader title="Cover note" description={a.coverNote ? `${a.coverNote.trim().split(/\s+/).length} words` : undefined} actions={a.applyChannel === "email" ? <Mail className="size-4 text-zinc-400" /> : undefined} />
          <p className="whitespace-pre-wrap p-4 text-sm leading-relaxed sm:p-5">{a.coverNote ?? "None generated."}</p>
          {a.validation && (
            <div className="border-t border-zinc-200 p-4 text-sm sm:p-5 dark:border-zinc-800">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                {a.validation.passed ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-red-600" />}
                Validation {a.validation.passed ? "passed" : "failed"} after {a.validation.attempts} attempt{a.validation.attempts > 1 ? "s" : ""}
                {a.validation.pageCount ? ` · ${a.validation.pageCount} page PDF` : ""}
              </p>
              {a.validation.issues.length > 0 && (
                <ul className="list-disc pl-5 text-zinc-500">
                  {a.validation.issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      )}

      {tab === "Fit" && a.score && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title={`Fit score ${a.score.fit_score}`} description={`Best match: ${a.score.role_type}`} />
            <ul className="list-disc space-y-1 py-4 pl-9 pr-4 text-sm">
              {a.score.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Card>
          <Card className="space-y-4 p-4 text-sm sm:p-5">
            {(
              [
                ["Matched skills", a.score.matched_skills, "green"],
                ["Missing skills", a.score.missing_skills, "amber"],
                ["Red flags", a.score.red_flags, "red"],
              ] as const
            ).map(([label, list, tone]) => (
              <div key={label}>
                <p className="mb-1.5 font-medium">{label}</p>
                {list.length ? (
                  <div className="flex flex-wrap gap-1">
                    {list.map((s) => (
                      <Badge key={s} tone={tone}>
                        {s}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-500">None</p>
                )}
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === "Job description" && (
        <Card>
          <p className="whitespace-pre-wrap p-4 text-sm leading-relaxed sm:p-5">{a.job.description || "No description captured."}</p>
        </Card>
      )}

      {a.hasScreenshot && (
        <Card className="mt-5">
          <CardHeader title="Submission proof" />
          <img alt="Confirmation screenshot" src={fileUrl(`/profiles/${profileId}/applications/${a.id}/screenshot`)} className="w-full" />
        </Card>
      )}
    </>
  );
}
