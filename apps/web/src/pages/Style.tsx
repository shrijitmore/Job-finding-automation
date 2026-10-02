import type { StyleRules } from "@jfa/shared";
import { SaveBar } from "@/components/SaveBar";
import { Card, CardHeader, Field, PageHeader, PageLoader, Switch, TagInput, Textarea } from "@/components/ui";
import { useSectionForm } from "@/lib/useSectionForm";

const TOGGLES: Array<{ key: keyof Pick<StyleRules, "banEmDashes" | "banEnDashes" | "shortSentences" | "noPowerVerbBullets" | "productFocused">; label: string; hint: string }> = [
  { key: "banEmDashes", label: "No em dashes", hint: "Blocks the — character. Checked by the validator." },
  { key: "banEnDashes", label: "No en dashes", hint: "Blocks the – character. Checked by the validator." },
  { key: "shortSentences", label: "Short, direct sentences", hint: "One idea per sentence. No filler." },
  { key: "noPowerVerbBullets", label: "No power-verb openers", hint: "Bullets don't start with words like Spearheaded or Leveraged." },
  { key: "productFocused", label: "Product-focused language", hint: "Describe what was built and who it helped, not buzzwords." },
];

export function StylePage() {
  const form = useSectionForm("styleRules");
  if (form.isLoading || !form.value) return <PageLoader />;
  const s = form.value;

  return (
    <>
      <PageHeader title="Writing style" description="Applied to every tailored resume and cover note for this profile. Banned phrases are enforced by the validator, not just the prompt." />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Rules" />
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {TOGGLES.map((t) => (
              <li key={t.key} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
                <div>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-zinc-500">{t.hint}</p>
                </div>
                <Switch label={t.label} checked={s[t.key]} onChange={(v) => form.update((x) => ({ ...x, [t.key]: v }))} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Banned phrases" description="Case-insensitive. Any match fails validation and triggers a rewrite." />
          <div className="p-4 sm:p-5">
            <TagInput label="Banned phrases" value={s.bannedPhrases} onChange={(bannedPhrases) => form.update((x) => ({ ...x, bannedPhrases }))} placeholder="Add a phrase" />
          </div>
        </Card>
        {s.noPowerVerbBullets && (
          <Card>
            <CardHeader title="Power verbs" description="Bullets may not start with these words." />
            <div className="p-4 sm:p-5">
              <TagInput label="Power verbs" value={s.powerVerbs} onChange={(powerVerbs) => form.update((x) => ({ ...x, powerVerbs }))} />
            </div>
          </Card>
        )}
        <Card>
          <CardHeader title="Extra instructions" />
          <div className="p-4 sm:p-5">
            <Field label="Anything else the writer should follow" hint="e.g. British spelling, mention open source work first.">
              <Textarea rows={3} value={s.extraInstructions} onChange={(e) => form.update((x) => ({ ...x, extraInstructions: e.target.value }))} />
            </Field>
          </div>
        </Card>
      </div>
      <SaveBar dirty={form.dirty} saving={form.save.isPending} saved={form.save.isSuccess} error={form.save.error} onSave={form.onSave} onReset={form.onReset} />
    </>
  );
}
