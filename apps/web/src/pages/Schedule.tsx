import { AlertTriangle, Plus, X } from "lucide-react";
import { useMemo } from "react";
import { RunNowButton } from "@/components/RunNowButton";
import { SaveBar } from "@/components/SaveBar";
import { Button, Card, CardHeader, Field, Input, PageHeader, PageLoader, Select, Switch } from "@/components/ui";
import { useSectionForm } from "@/lib/useSectionForm";

export function SchedulePage() {
  const form = useSectionForm("schedule");
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return ["UTC"];
    }
  }, []);
  if (form.isLoading || !form.value) return <PageLoader />;
  const s = form.value;
  const perRun = s.runTimes.length ? Math.ceil(s.dailyCap / s.runTimes.length) : 0;

  return (
    <>
      <PageHeader title="Schedule and limits" description="When this profile runs and how much it may send." actions={form.profile ? <RunNowButton profileId={form.profile.id} dryRun={form.profile.schedule.dryRun} /> : undefined} />
      <div className="space-y-5">
        <Card className={s.dryRun ? "" : "ring-red-300 dark:ring-red-900"}>
          <CardHeader title="Mode" />
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <li className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
              <div>
                <p className="text-sm font-medium">Dry run</p>
                <p className="text-xs text-zinc-500">Runs the full pipeline but sends and submits nothing. Would-be outputs show in the dashboard.</p>
              </div>
              <Switch
                label="Dry run"
                checked={s.dryRun}
                onChange={(v) => {
                  if (!v && !confirm("Turn off dry run? Scheduled runs will send real emails and submit real applications for this profile.")) return;
                  form.update((x) => ({ ...x, dryRun: v }));
                }}
              />
            </li>
            <li className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
              <div>
                <p className="text-sm font-medium">Scheduled runs</p>
                <p className="text-xs text-zinc-500">When off, the profile only runs when you press Run now.</p>
              </div>
              <Switch label="Scheduled runs" checked={s.enabled} onChange={(v) => form.update((x) => ({ ...x, enabled: v }))} />
            </li>
          </ul>
          {!s.dryRun && (
            <div className="flex items-center gap-2 border-t border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-500/10 dark:text-red-400">
              <AlertTriangle className="size-4 shrink-0" /> Live mode. Applications and emails are really sent.
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Run times" description={`In ${s.timezone}.`} />
          <div className="space-y-4 p-4 sm:p-5">
            <Field label="Time zone">
              <Select value={s.timezone} onChange={(e) => form.update((x) => ({ ...x, timezone: e.target.value }))}>
                {zones.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              {s.runTimes.map((t, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    type="time"
                    aria-label={`Run time ${i + 1}`}
                    className="w-32"
                    value={t}
                    onChange={(e) => form.update((x) => ({ ...x, runTimes: x.runTimes.map((r, j) => (j === i ? e.target.value : r)) }))}
                  />
                  {s.runTimes.length > 1 && (
                    <button aria-label="Remove run time" className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => form.update((x) => ({ ...x, runTimes: x.runTimes.filter((_, j) => j !== i) }))}>
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              {s.runTimes.length < 6 && (
                <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => form.update((x) => ({ ...x, runTimes: [...x.runTimes, "12:00"] }))}>
                  Add time
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Limits" />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field label="Daily application cap" hint={`Split across runs: up to ${perRun} per run.`}>
              <Input type="number" min={0} max={100} value={s.dailyCap} onChange={(e) => form.update((x) => ({ ...x, dailyCap: Math.max(0, Number(e.target.value) || 0) }))} />
            </Field>
            <Field label="Per-company cooldown (days)" hint="Don't apply to the same company again within this window.">
              <Input type="number" min={0} max={365} value={s.companyCooldownDays} onChange={(e) => form.update((x) => ({ ...x, companyCooldownDays: Math.max(0, Number(e.target.value) || 0) }))} />
            </Field>
          </div>
        </Card>
      </div>
      <SaveBar dirty={form.dirty} saving={form.save.isPending} saved={form.save.isSuccess} error={form.save.error} onSave={form.onSave} onReset={form.onReset} />
    </>
  );
}
