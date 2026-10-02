import { Play } from "lucide-react";
import { Button } from "./ui";
import { useRunNow } from "@/lib/runs";

export function RunNowButton({ profileId, dryRun }: { profileId: string; dryRun: boolean }) {
  const run = useRunNow(profileId);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        icon={<Play className="size-4" />}
        loading={run.isPending}
        onClick={() => {
          if (!dryRun && !confirm("Dry run is OFF for this profile. This run will send real emails and submit real applications. Continue?")) return;
          run.mutate();
        }}
      >
        Run now{dryRun ? " (dry run)" : ""}
      </Button>
      {run.isSuccess && <span className="text-xs text-emerald-600">Queued. Watch progress in Run logs.</span>}
      {run.error && <span className="max-w-xs text-right text-xs text-red-600">{(run.error as Error).message}</span>}
    </div>
  );
}
