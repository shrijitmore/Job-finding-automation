import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReplyCategory } from "@jfa/shared";
import { Inbox as InboxIcon, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, PageLoader, Textarea, type Tone } from "@/components/ui";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useProfileId } from "@/lib/profile";

interface ReplyRow {
  id: string;
  category: ReplyCategory | null;
  status: "new" | "auto_replied" | "auto_reply_pending" | "flagged" | "sent" | "dismissed";
  fromAddress: string;
  subject: string;
  body: string;
  summary: string | null;
  suggestedReply: string | null;
  sentReply: string | null;
  receivedAt: string;
  application: { id: string; status: string } | null;
  job: { title: string; company: string } | null;
}

const CATEGORY: Record<ReplyCategory, { label: string; tone: Tone }> = {
  interview_scheduling: { label: "Interview", tone: "green" },
  salary_question: { label: "Salary", tone: "amber" },
  assessment: { label: "Assessment", tone: "blue" },
  resume_request: { label: "Resume request", tone: "accent" },
  portfolio_request: { label: "Portfolio request", tone: "accent" },
  rejection: { label: "Rejection", tone: "red" },
  other: { label: "Other", tone: "neutral" },
};

const GROUPS = [
  { key: "attention", label: "Needs you", match: (r: ReplyRow) => r.status === "flagged" },
  { key: "auto", label: "Auto-handled", match: (r: ReplyRow) => ["auto_replied", "auto_reply_pending"].includes(r.status) },
  { key: "done", label: "Sent and dismissed", match: (r: ReplyRow) => ["sent", "dismissed"].includes(r.status) && r.category !== "rejection" },
  { key: "rejections", label: "Rejections", match: (r: ReplyRow) => r.category === "rejection" },
] as const;

function ReplyCard({ r, profileId }: { r: ReplyRow; profileId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(r.suggestedReply ?? "");
  const [open, setOpen] = useState(r.status === "flagged");
  const refresh = () => qc.invalidateQueries({ queryKey: ["replies", profileId] });
  const send = useMutation({ mutationFn: () => api.post(`/profiles/${profileId}/replies/${r.id}/send`, { body: draft }), onSuccess: refresh });
  const dismiss = useMutation({ mutationFn: () => api.patch(`/profiles/${profileId}/replies/${r.id}`, { status: "dismissed" }), onSuccess: refresh });
  const cat = r.category ? CATEGORY[r.category] : CATEGORY.other;

  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 px-4 py-3 text-left sm:px-5" aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={cat.tone}>{cat.label}</Badge>
            {r.status === "auto_reply_pending" && <Badge tone="accent">Dry run: would auto-reply</Badge>}
            {r.status === "auto_replied" && <Badge tone="green">Auto-replied</Badge>}
            {r.status === "sent" && <Badge tone="green">Sent</Badge>}
            <span className="text-xs text-zinc-500">{timeAgo(r.receivedAt)}</span>
          </div>
          <p className="mt-1 truncate font-medium">{r.job ? `${r.job.company}: ${r.job.title}` : r.subject}</p>
          <p className="truncate text-sm text-zinc-500">{r.summary ?? r.subject}</p>
        </div>
      </button>
      {open && (
        <div className="space-y-4 border-t border-zinc-200 px-4 py-4 sm:px-5 dark:border-zinc-800">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">From {r.fromAddress}</p>
            <p className="whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950/50">{r.body}</p>
            {r.application && (
              <Link to={`../applications/${r.application.id}`} className="mt-1 inline-block text-xs font-medium text-accent-600 hover:underline">
                View application
              </Link>
            )}
          </div>
          {r.sentReply && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Your reply</p>
              <p className="whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm dark:bg-emerald-500/10">{r.sentReply}</p>
            </div>
          )}
          {r.status === "flagged" && (
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500" htmlFor={`draft-${r.id}`}>
                Suggested draft. Edit before sending.
              </label>
              <Textarea id={`draft-${r.id}`} rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <ErrorNote error={send.error ?? dismiss.error} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" loading={dismiss.isPending} onClick={() => dismiss.mutate()}>
                  Dismiss
                </Button>
                <Button
                  icon={<Send className="size-4" />}
                  loading={send.isPending}
                  disabled={!draft.trim()}
                  onClick={() => confirm(`Send this reply to ${r.fromAddress} from your Gmail?`) && send.mutate()}
                >
                  Send reply
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function InboxPage() {
  const profileId = useProfileId();
  const { data, isLoading } = useQuery({ queryKey: ["replies", profileId], queryFn: () => api.get<ReplyRow[]>(`/profiles/${profileId}/replies`), refetchInterval: 60_000 });
  const [group, setGroup] = useState<(typeof GROUPS)[number]["key"]>("attention");
  if (isLoading || !data) return <PageLoader />;
  const current = GROUPS.find((g) => g.key === group)!;
  const list = data.filter(current.match);

  return (
    <>
      <PageHeader title="Inbox" description="Recruiter replies on threads the agent started. Resume and portfolio requests are answered automatically; everything else waits for you." />
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist">
        {GROUPS.map((g) => {
          const n = data.filter(g.match).length;
          return (
            <button
              key={g.key}
              role="tab"
              aria-selected={group === g.key}
              onClick={() => setGroup(g.key)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${group === g.key ? "bg-white shadow-sm dark:bg-zinc-800" : "text-zinc-500"}`}
            >
              {g.label} {n > 0 && <span className="ml-1 tabular-nums text-zinc-400">{n}</span>}
            </button>
          );
        })}
      </div>
      {list.length ? (
        <div className="space-y-3">
          {list.map((r) => (
            <ReplyCard key={r.id} r={r} profileId={profileId} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<InboxIcon className="size-8" />} title="Nothing here" description={group === "attention" ? "No replies need your attention." : undefined} />
        </Card>
      )}
    </>
  );
}
