import { Check } from "lucide-react";
import { Button, ErrorNote } from "./ui";

/** Sticky save bar shown at the bottom of editable forms. */
export function SaveBar({
  dirty,
  saving,
  saved,
  error,
  onSave,
  onReset,
  label = "Save changes",
}: {
  dirty: boolean;
  saving: boolean;
  saved?: boolean;
  error?: unknown;
  onSave: () => void;
  onReset?: () => void;
  label?: string;
}) {
  return (
    <div className="sticky bottom-16 z-10 mt-6 lg:bottom-4">
      <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl bg-white/95 px-4 py-3 shadow-lg ring-1 ring-zinc-200 backdrop-blur dark:bg-zinc-900/95 dark:ring-zinc-800">
        <div className="mr-auto text-sm text-zinc-500">
          {error ? <ErrorNote error={error} /> : dirty ? "Unsaved changes" : saved ? (
            <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="size-4" /> Saved</span>
          ) : "All changes saved"}
        </div>
        {onReset && dirty && (
          <Button variant="ghost" onClick={onReset}>
            Discard
          </Button>
        )}
        <Button onClick={onSave} loading={saving} disabled={!dirty}>
          {label}
        </Button>
      </div>
    </div>
  );
}
