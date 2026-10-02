import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProfileSkill, SkillTier } from "@jfa/shared";
import clsx from "clsx";
import { Plus, Sparkles, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { SaveBar } from "@/components/SaveBar";
import { Card, CardHeader, EmptyState, Input, PageHeader, PageLoader, Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useProfileId } from "@/lib/profile";

interface SkillsResponse {
  skills: ProfileSkill[];
  suggestions: string[];
}

function TierToggle({ value, onChange, name }: { value: SkillTier; onChange: (t: SkillTier) => void; name: string }) {
  return (
    <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800" role="radiogroup" aria-label={`${name} tier`}>
      {(["core", "extended"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          onClick={() => onChange(t)}
          className={clsx(
            "rounded-md px-2.5 py-1 font-medium capitalize",
            value === t ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white" : "text-zinc-500",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function SkillsPage() {
  const profileId = useProfileId();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["skills", profileId],
    queryFn: () => api.get<SkillsResponse>(`/profiles/${profileId}/skills`),
  });
  const [skills, setSkills] = useState<ProfileSkill[]>([]);
  const [dirty, setDirty] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState<SkillTier>("core");

  useEffect(() => {
    if (data && !dirty) setSkills(data.skills);
  }, [data, dirty]);

  const save = useMutation({
    mutationFn: () => api.put<SkillsResponse>(`/profiles/${profileId}/skills`, { skills }),
    onSuccess: (res) => {
      qc.setQueryData(["skills", profileId], res);
      setSkills(res.skills);
      setDirty(false);
    },
  });

  if (isLoading || !data) return <PageLoader />;

  const has = (name: string) => skills.some((s) => s.name.toLowerCase() === name.toLowerCase());
  const add = (name: string, tier: SkillTier) => {
    const n = name.trim();
    if (!n || has(n)) return;
    setSkills((s) => [...s, { name: n, tier }]);
    setDirty(true);
  };
  const suggestions = data.suggestions.filter((s) => !has(s));

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    for (const part of newName.split(",")) add(part, newTier);
    setNewName("");
  };

  const groups: Array<{ tier: SkillTier; title: string; description: string }> = [
    { tier: "core", title: "Core skills", description: "You use these. They can appear anywhere on a tailored resume." },
    { tier: "extended", title: "Extended skills", description: "You can pick these up. Shown only on an \"Also working with\" line when a job asks for them." },
  ];

  return (
    <>
      <PageHeader
        title="Skills"
        description="Tailored resumes only ever use skills from this list. Nothing outside it is added, even if a job asks for it."
      />

      <Card className="mb-5">
        <form onSubmit={onAdd} className="flex flex-wrap items-center gap-2 p-4">
          <Input
            aria-label="New skill"
            className="min-w-48 flex-1"
            placeholder="Add skills, separated by commas"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <TierToggle name="New skill" value={newTier} onChange={setNewTier} />
          <Button type="submit" icon={<Plus className="size-4" />} disabled={!newName.trim()}>
            Add
          </Button>
        </form>
        {suggestions.length > 0 && (
          <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-4 text-accent-500" /> Suggested from your resume
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => add(s, "core")}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm ring-1 ring-dashed ring-zinc-300 hover:bg-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800"
                >
                  <Plus className="size-3" /> {s}
                </button>
              ))}
              <button onClick={() => suggestions.forEach((s) => add(s, "core"))} className="px-2 py-1 text-sm font-medium text-accent-600 hover:underline">
                Add all
              </button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((g) => {
          const list = skills.filter((s) => s.tier === g.tier);
          return (
            <Card key={g.tier}>
              <CardHeader title={`${g.title} (${list.length})`} description={g.description} />
              {list.length === 0 ? (
                <EmptyState title="None yet" />
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {list.map((s) => (
                    <li key={s.name} className="flex items-center gap-2 px-4 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                      <TierToggle
                        name={s.name}
                        value={s.tier}
                        onChange={(t) => {
                          setSkills((all) => all.map((x) => (x.name === s.name ? { ...x, tier: t } : x)));
                          setDirty(true);
                        }}
                      />
                      <button
                        aria-label={`Remove ${s.name}`}
                        onClick={() => {
                          setSkills((all) => all.filter((x) => x.name !== s.name));
                          setDirty(true);
                        }}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        saved={save.isSuccess}
        error={save.error}
        onSave={() => save.mutate()}
        onReset={() => {
          setSkills(data.skills);
          setDirty(false);
        }}
      />
    </>
  );
}
