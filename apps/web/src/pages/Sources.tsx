import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FIELDS, FIELD_LABELS, PLUGIN_LABELS, detectPlugin, type Field as JobField, type SourceSeed } from "@jfa/shared";
import { ExternalLink, Globe, Lightbulb, Plus, RefreshCw, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { ChoiceGroup } from "@/components/Choice";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, Field, Input, Modal, PageHeader, PageLoader, Switch, type Tone } from "@/components/ui";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";

export interface SourceRow {
  id: string;
  name: string;
  plugin: SourceSeed["plugin"];
  url: string;
  fields: JobField[];
  config: NonNullable<SourceSeed["config"]>;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: "ok" | "error" | "blocked" | "skipped" | null;
  lastError: string | null;
  lastJobCount: number;
  totalJobCount: number;
  blockedUntil: string | null;
}

const STATUS: Record<string, { tone: Tone; label: string }> = {
  ok: { tone: "green", label: "OK" },
  error: { tone: "red", label: "Error" },
  blocked: { tone: "amber", label: "Blocked" },
  skipped: { tone: "neutral", label: "Skipped" },
};

function AddSourceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [fields, setFields] = useState<JobField[]>([]);
  const [render, setRender] = useState(false);
  const plugin = url ? detectPlugin(url) : null;

  const add = useMutation({
    mutationFn: () => api.post("/sources", { url, name: name || undefined, fields, config: plugin === "generic" ? { render } : {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources"] });
      setUrl("");
      setName("");
      setFields([]);
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a source"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-source" loading={add.isPending} disabled={!url || !fields.length}>
            Add source
          </Button>
        </>
      }
    >
      <form
        id="add-source"
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <Field label="URL" hint={plugin ? `Detected: ${PLUGIN_LABELS[plugin]}` : "A career page, Greenhouse/Lever/Ashby board, RSS feed or job board page."}>
          <Input type="url" required placeholder="https://company.com/careers" value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <Field label="Name (optional)">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme careers" />
        </Field>
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Fields</span>
          <p className="text-xs text-zinc-500">Only profiles targeting these fields pull from this source.</p>
          <ChoiceGroup label="Source fields" options={FIELDS} value={fields} onChange={setFields} render={(f) => FIELD_LABELS[f]} />
        </div>
        {plugin === "generic" && (
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Render with a browser</span>
              <span className="block text-xs text-zinc-500">For sites that load jobs with JavaScript. Slower.</span>
            </span>
            <Switch label="Render with a browser" checked={render} onChange={setRender} />
          </label>
        )}
        <ErrorNote error={add.error} />
      </form>
    </Modal>
  );
}

export function SourcesPage() {
  const qc = useQueryClient();
  const { data: sources, isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: () => api.get<SourceRow[]>("/sources"),
    refetchInterval: 15_000,
  });
  const { data: proposed } = useQuery({ queryKey: ["sources", "proposed"], queryFn: () => api.get<SourceSeed[]>("/sources/proposed") });
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<JobField | "all">("all");
  const [scanning, setScanning] = useState<Set<string>>(new Set());

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<SourceRow> }) => api.patch(`/sources/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/sources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
  const confirmProposed = useMutation({
    mutationFn: async (list: SourceSeed[]) => {
      for (const p of list) await api.post("/sources", { url: p.url, name: p.name, plugin: p.plugin, fields: p.fields, config: p.config });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
  const scan = useMutation({
    mutationFn: (id: string) => api.post(`/sources/${id}/scan`),
    onMutate: (id) => setScanning((s) => new Set(s).add(id)),
    onSettled: (_d, _e, id) =>
      setTimeout(() => {
        setScanning((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        qc.invalidateQueries({ queryKey: ["sources"] });
      }, 20_000),
  });

  const visible = useMemo(() => (sources ?? []).filter((s) => filter === "all" || s.fields.includes(filter)), [sources, filter]);

  if (isLoading || !sources) return <PageLoader />;
  const enabled = sources.filter((s) => s.enabled).length;

  return (
    <>
      <PageHeader
        title="Sources"
        description={`${enabled} of ${sources.length} enabled. Shared by all profiles; each profile only uses sources tagged with its fields.`}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
            Add source
          </Button>
        }
      />

      {proposed && proposed.length > 0 && (
        <Card className="mb-5">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Lightbulb className="size-4 text-amber-500" /> Suggested boards for creative, product and marketing roles
              </span>
            }
            description="Researched public boards. Nothing is added until you confirm."
            actions={
              <Button size="sm" variant="secondary" loading={confirmProposed.isPending} onClick={() => confirmProposed.mutate(proposed)}>
                Add all
              </Button>
            }
          />
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {proposed.map((p) => (
              <li key={p.url} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 sm:px-5">
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <p className="text-sm font-medium">
                    {p.name}{" "}
                    <a href={p.url} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-600" aria-label={`Open ${p.name}`}>
                      <ExternalLink className="inline size-3.5" />
                    </a>
                  </p>
                  {p.note && <p className="text-xs text-zinc-500">{p.note}</p>}
                </div>
                <div className="flex flex-1 flex-wrap gap-1 sm:flex-none">
                  {p.fields.map((f) => (
                    <Badge key={f}>{FIELD_LABELS[f]}</Badge>
                  ))}
                </div>
                <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => confirmProposed.mutate([p])} aria-label={`Add ${p.name}`}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["all", ...FIELDS] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"}`}
          >
            {f === "all" ? "All" : FIELD_LABELS[f]}
          </button>
        ))}
      </div>

      <Card>
        {visible.length === 0 ? (
          <EmptyState icon={<Globe className="size-8" />} title="No sources" description="Add a career page, ATS board or job board." />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {visible.map((s) => {
              const st = s.lastStatus ? STATUS[s.lastStatus] : null;
              const backingOff = s.blockedUntil && new Date(s.blockedUntil) > new Date();
              return (
                <li key={s.id} className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5 ${s.enabled ? "" : "opacity-60"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <Badge tone="accent">{s.plugin === "generic" ? "AI extractor" : s.plugin.replace("_", " ")}</Badge>
                      {st && <Badge tone={st.tone}>{st.label}</Badge>}
                      {backingOff && <Badge tone="amber">Backing off</Badge>}
                    </div>
                    <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-zinc-500 hover:underline">
                      {s.url}
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                      <span>Last run {timeAgo(s.lastRunAt)}</span>
                      <span>{s.lastJobCount} jobs last run</span>
                      <span>{s.totalJobCount} found total</span>
                      <span className="flex flex-wrap gap-1">
                        {s.fields.map((f) => (
                          <span key={f} className="rounded bg-zinc-100 px-1.5 dark:bg-zinc-800">
                            {FIELD_LABELS[f]}
                          </span>
                        ))}
                      </span>
                    </div>
                    {s.lastError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{s.lastError}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RefreshCw className={`size-3.5 ${scanning.has(s.id) ? "animate-spin" : ""}`} />}
                      disabled={scanning.has(s.id)}
                      onClick={() => scan.mutate(s.id)}
                    >
                      {scanning.has(s.id) ? "Scanning" : "Scan now"}
                    </Button>
                    <button
                      aria-label={`Delete ${s.name}`}
                      className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                      onClick={() => confirm(`Remove ${s.name}?`) && remove.mutate(s.id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                    <Switch label={`Enable ${s.name}`} checked={s.enabled} onChange={(v) => patch.mutate({ id: s.id, body: { enabled: v } })} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <AddSourceModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
