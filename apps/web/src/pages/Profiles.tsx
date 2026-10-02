import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Trash2, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useProfiles } from "@/components/AppShell";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Modal, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";

export function ProfilesPage() {
  const { data: profiles, isLoading } = useProfiles();
  const [params, setParams] = useSearchParams();
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const open = params.get("new") === "1" || (profiles?.length === 0 && !isLoading);

  const create = useMutation({
    mutationFn: () =>
      api.post<Profile>("/profiles", { name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    onSuccess: async (p) => {
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      navigate(`/p/${p.id}/resume`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/profiles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  if (isLoading) return <PageLoader />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Candidate profiles</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Each profile has its own resume, preferences, Gmail, schedule and history.
          </p>
        </div>
        <Button icon={<Plus className="size-4" />} onClick={() => setParams({ new: "1" })}>
          New profile
        </Button>
      </div>

      <Card>
        {profiles?.length ? (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {profiles.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-600 font-semibold text-white">
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {p.onboarded ? <Badge tone="green">Ready</Badge> : <Badge tone="amber">Needs setup</Badge>}
                    {p.dryRun ? <Badge>Dry run</Badge> : <Badge tone="red">Live</Badge>}
                    {p.enabled ? <Badge tone="blue">Scheduled</Badge> : <Badge>Paused</Badge>}
                  </div>
                </div>
                <button
                  className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => {
                    if (confirm(`Delete profile "${p.name}" and all its history?`)) remove.mutate(p.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
                <Link
                  to={`/p/${p.id}/${p.onboarded ? "dashboard" : "resume"}`}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-accent-600 hover:bg-accent-50 dark:text-accent-500 dark:hover:bg-accent-500/10"
                >
                  Open <ArrowRight className="size-4" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Users className="size-8" />} title="No profiles yet" description="Create your first candidate profile to get started." />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setParams({})}
        title="New profile"
        footer={
          <>
            <Button variant="secondary" onClick={() => setParams({})}>
              Cancel
            </Button>
            <Button type="submit" form="new-profile" loading={create.isPending}>
              Create
            </Button>
          </>
        }
      >
        <form id="new-profile" onSubmit={onSubmit} className="space-y-4">
          <Field label="Profile name" hint="Usually the candidate's name.">
            <Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </Field>
          <ErrorNote error={create.error} />
        </form>
      </Modal>
    </div>
  );
}
