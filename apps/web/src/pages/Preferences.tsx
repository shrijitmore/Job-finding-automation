import { FIELDS, FIELD_LABELS, JOB_TYPES, ROLE_CATALOG, WORK_MODES, type Field as JobField } from "@jfa/shared";
import clsx from "clsx";
import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ChoiceGroup } from "@/components/Choice";
import { SaveBar } from "@/components/SaveBar";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, PageLoader, Select, TagInput } from "@/components/ui";
import { uid } from "@/lib/profile";
import { useSectionForm } from "@/lib/useSectionForm";

export function PreferencesPage() {
  const form = useSectionForm("preferences");
  const [query, setQuery] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customField, setCustomField] = useState<JobField>("engineering");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = ROLE_CATALOG.filter(
      (r) => !q || r.label.toLowerCase().includes(q) || r.keywords.some((k) => k.includes(q)) || FIELD_LABELS[r.field].toLowerCase().includes(q),
    );
    return FIELDS.map((f) => ({ field: f, roles: matches.filter((r) => r.field === f) })).filter((g) => g.roles.length);
  }, [query]);

  if (form.isLoading || !form.value) return <PageLoader />;
  const p = form.value;
  const selected = new Set(p.roleTypeIds);
  const toggle = (id: string) =>
    form.update((v) => ({ ...v, roleTypeIds: selected.has(id) ? v.roleTypeIds.filter((x) => x !== id) : [...v.roleTypeIds, id] }));

  const selectedLabels = [
    ...ROLE_CATALOG.filter((r) => selected.has(r.id)),
    ...p.customRoleTypes,
  ];

  return (
    <>
      <PageHeader title="Job preferences" description="Hard filters run before any AI call, so tight preferences also save tokens." />
      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Role types"
            description="Pick every role you want. Sources are matched to the fields of these roles."
            actions={<Badge tone="accent">{selectedLabels.length} selected</Badge>}
          />
          <div className="space-y-4 p-4 sm:p-5">
            {selectedLabels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedLabels.map((r) => (
                  <span key={r.id} className="inline-flex items-center gap-1 rounded-md bg-accent-50 py-0.5 pl-2 pr-1 text-sm text-accent-700 dark:bg-accent-500/15 dark:text-accent-100">
                    {r.label}
                    <span className="text-xs opacity-60">{FIELD_LABELS[r.field]}</span>
                    <button
                      aria-label={`Remove ${r.label}`}
                      className="rounded p-0.5 hover:bg-accent-100 dark:hover:bg-accent-500/20"
                      onClick={() =>
                        form.update((v) => ({
                          ...v,
                          roleTypeIds: v.roleTypeIds.filter((x) => x !== r.id),
                          customRoleTypes: v.customRoleTypes.filter((x) => x.id !== r.id),
                        }))
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input aria-label="Search roles" className="pl-9" placeholder="Search roles, e.g. video editor, solidity, PM" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
              {grouped.map((g) => (
                <div key={g.field}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{FIELD_LABELS[g.field]}</p>
                  <div className="flex flex-wrap gap-2">
                    {g.roles.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={selected.has(r.id)}
                        onClick={() => toggle(r.id)}
                        className={clsx(
                          "rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition-colors",
                          selected.has(r.id)
                            ? "bg-accent-600 font-medium text-white ring-accent-600"
                            : "ring-zinc-200 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800",
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {grouped.length === 0 && <p className="text-sm text-zinc-500">No matching roles. Add it as a custom role below.</p>}
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <Field label="Custom role" className="min-w-48 flex-1">
                <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g. Thumbnail Designer" />
              </Field>
              <Field label="Field" className="w-40">
                <Select value={customField} onChange={(e) => setCustomField(e.target.value as JobField)}>
                  {FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {FIELD_LABELS[f]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                variant="secondary"
                icon={<Plus className="size-4" />}
                disabled={!customLabel.trim()}
                onClick={() => {
                  const label = customLabel.trim();
                  form.update((v) => ({
                    ...v,
                    customRoleTypes: [...v.customRoleTypes, { id: uid("custom"), label, field: customField, keywords: [label.toLowerCase()] }],
                  }));
                  setCustomLabel("");
                }}
              >
                Add custom role
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Experience and location" />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field label="Minimum years asked for">
              <Input type="number" min={0} max={50} value={p.minYears} onChange={(e) => form.update((v) => ({ ...v, minYears: Number(e.target.value) || 0 }))} />
            </Field>
            <Field label="Maximum years asked for">
              <Input type="number" min={0} max={50} value={p.maxYears} onChange={(e) => form.update((v) => ({ ...v, maxYears: Number(e.target.value) || 0 }))} />
            </Field>
            <Field label="Locations" hint="Cities or countries. Leave empty for anywhere. Remote jobs always pass." className="sm:col-span-2">
              <TagInput label="Locations" value={p.locations} onChange={(locations) => form.update((v) => ({ ...v, locations }))} placeholder="e.g. Bengaluru, India, Berlin" />
            </Field>
            <div className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Work mode</span>
              <ChoiceGroup label="Work mode" options={WORK_MODES} value={p.workModes} onChange={(workModes) => form.update((v) => ({ ...v, workModes }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Job type</span>
              <ChoiceGroup label="Job type" options={JOB_TYPES} value={p.jobTypes} onChange={(jobTypes) => form.update((v) => ({ ...v, jobTypes }))} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Exclusions and thresholds" />
          <div className="grid gap-4 p-4 sm:p-5">
            <Field label="Excluded companies">
              <TagInput label="Excluded companies" value={p.excludedCompanies} onChange={(excludedCompanies) => form.update((v) => ({ ...v, excludedCompanies }))} />
            </Field>
            <Field label="Excluded keywords" hint="Jobs whose title or description contains any of these are skipped.">
              <TagInput label="Excluded keywords" value={p.excludedKeywords} onChange={(excludedKeywords) => form.update((v) => ({ ...v, excludedKeywords }))} placeholder="e.g. unpaid, commission only" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Minimum fit score: ${p.minFitScore}`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={p.minFitScore}
                  aria-label="Minimum fit score"
                  onChange={(e) => form.update((v) => ({ ...v, minFitScore: Number(e.target.value) }))}
                  className="w-full accent-accent-600"
                />
              </Field>
              <Field label="Posted within (days)">
                <Input type="number" min={1} max={90} value={p.maxPostedDays} onChange={(e) => form.update((v) => ({ ...v, maxPostedDays: Math.max(1, Number(e.target.value) || 21) }))} />
              </Field>
            </div>
          </div>
        </Card>
      </div>
      <SaveBar dirty={form.dirty} saving={form.save.isPending} saved={form.save.isSuccess} error={form.save.error} onSave={form.onSave} onReset={form.onReset} />
    </>
  );
}
