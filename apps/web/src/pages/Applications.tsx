import { useQuery } from "@tanstack/react-query";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@jfa/shared";
import { Briefcase, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import type { SourceRow } from "./Sources";
import { Badge, Button, Card, EmptyState, Input, PageHeader, PageLoader, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useProfileId } from "@/lib/profile";
import { CHANNEL_LABEL, STATUS_META, scoreTone } from "@/lib/status";

export interface ApplicationListItem {
  id: string;
  status: ApplicationStatus;
  fitScore: number | null;
  roleType: string | null;
  field: string | null;
  applyChannel: string | null;
  applyTarget: string | null;
  skipReason: string | null;
  appliedAt: string | null;
  updatedAt: string;
  hasPdf: boolean;
  job: { id: string; title: string; company: string; location: string; url: string; postedAt: string | null };
  source: { id: string | null; name: string | null } | null;
}

export interface ApplicationList {
  items: ApplicationListItem[];
  total: number;
  page: number;
  pageSize: number;
  roleTypes: string[];
}

export function ApplicationsPage() {
  const profileId = useProfileId();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const qs = useMemo(() => {
    const p = new URLSearchParams(params);
    p.set("pageSize", "25");
    return p.toString();
  }, [params]);
  const { data, isLoading } = useQuery({
    queryKey: ["applications", profileId, qs],
    queryFn: () => api.get<ApplicationList>(`/profiles/${profileId}/applications?${qs}`),
    placeholderData: (prev) => prev,
  });
  const { data: sources } = useQuery({ queryKey: ["sources"], queryFn: () => api.get<SourceRow[]>("/sources") });

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next, { replace: true });
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Applications" description={data ? `${data.total} total` : undefined} />
      <Card className="mb-4 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input aria-label="Search applications" className="pl-9" placeholder="Title or company" defaultValue={params.get("q") ?? ""} onChange={(e) => set("q", e.target.value)} />
        </div>
        <Select aria-label="Status" value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
          <option value="">All statuses</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </Select>
        <Select aria-label="Role type" value={params.get("roleType") ?? ""} onChange={(e) => set("roleType", e.target.value)}>
          <option value="">All role types</option>
          {data?.roleTypes.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
        <Select aria-label="Source" value={params.get("sourceId") ?? ""} onChange={(e) => set("sourceId", e.target.value)}>
          <option value="">All sources</option>
          {sources?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Input aria-label="From date" type="date" value={params.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} />
          <Input aria-label="To date" type="date" value={params.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} />
        </div>
      </Card>

      {isLoading ? (
        <PageLoader />
      ) : !data?.items.length ? (
        <Card>
          <EmptyState icon={<Briefcase className="size-8" />} title="No applications match" description="Change the filters or run the agent." />
        </Card>
      ) : (
        <Card>
          {/* Table on wide screens */}
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-2.5 font-medium">Score</th>
                <th className="px-4 py-2.5 font-medium">Job</th>
                <th className="px-4 py-2.5 font-medium">Role type</th>
                <th className="px-4 py-2.5 font-medium">Channel</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.items.map((a) => (
                <tr key={a.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <td className="px-4 py-2.5">
                    <Badge tone={scoreTone(a.fitScore)} className="w-9 justify-center tabular-nums">
                      {a.fitScore ?? "–"}
                    </Badge>
                  </td>
                  <td className="max-w-xs px-4 py-2.5">
                    <Link to={a.id} className="block truncate font-medium hover:underline">
                      {a.job.title}
                    </Link>
                    <span className="block truncate text-xs text-zinc-500">
                      {a.job.company}
                      {a.source?.name ? ` · ${a.source.name}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{a.roleType ?? "–"}</td>
                  <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{CHANNEL_LABEL[a.applyChannel ?? "manual"]}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">{formatDate(a.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Cards on phones */}
          <ul className="divide-y divide-zinc-100 md:hidden dark:divide-zinc-800">
            {data.items.map((a) => (
              <li key={a.id}>
                <Link to={a.id} className="flex items-start gap-3 px-4 py-3">
                  <Badge tone={scoreTone(a.fitScore)} className="mt-0.5 w-9 justify-center tabular-nums">
                    {a.fitScore ?? "–"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.job.title}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {a.job.company} · {CHANNEL_LABEL[a.applyChannel ?? "manual"]}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</Badge>
                      <span className="text-xs text-zinc-500">{formatDate(a.updatedAt)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2.5 text-sm dark:border-zinc-800">
              <span className="text-zinc-500">
                Page {page} of {pages}
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setParams((p) => (p.set("page", String(page - 1)), p))} aria-label="Previous page">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setParams((p) => (p.set("page", String(page + 1)), p))} aria-label="Next page">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
