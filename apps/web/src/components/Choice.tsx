import clsx from "clsx";
import { Check } from "lucide-react";

/** Pill-style multi-select used for small fixed option sets. */
export function ChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  render = (o) => o,
}: {
  options: readonly T[];
  value: T[];
  onChange: (v: T[]) => void;
  label: string;
  render?: (o: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium capitalize ring-1 ring-inset transition-colors",
              on
                ? "bg-accent-600 text-white ring-accent-600"
                : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800",
            )}
          >
            {on && <Check className="size-3.5" />}
            {render(o)}
          </button>
        );
      })}
    </div>
  );
}
