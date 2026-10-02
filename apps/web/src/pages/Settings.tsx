import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";

interface SettingsResponse {
  anthropic: { configured: boolean; source: "saved" | "env" | null; masked: string | null };
}

export function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: () => api.get<SettingsResponse>("/settings") });
  const [key, setKey] = useState("");

  const saveKey = useMutation({
    mutationFn: () => api.put("/settings/anthropic", { apiKey: key }),
    onSuccess: () => {
      setKey("");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const removeKey = useMutation({
    mutationFn: () => api.delete("/settings/anthropic"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  if (isLoading || !data) return <PageLoader />;
  const a = data.anthropic;

  return (
    <>
      <PageHeader title="Settings" description="Keys and connections. Secrets are encrypted at rest and never shown again in full." />
      <div className="space-y-5">
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><KeyRound className="size-4" /> Claude API key</span>}
            description="Used for parsing, scoring, tailoring, validation and reply classification. Shared by all profiles."
            actions={a.configured ? <Badge tone="green">{a.source === "env" ? "From server env" : "Saved"} {a.masked}</Badge> : <Badge tone="amber">Not set</Badge>}
          />
          <form
            className="flex flex-wrap items-end gap-2 p-4 sm:p-5"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              saveKey.mutate();
            }}
          >
            <Field label={a.source === "saved" ? "Replace key" : "API key"} className="min-w-64 flex-1">
              <Input type="password" autoComplete="off" placeholder="sk-ant-..." value={key} onChange={(e) => setKey(e.target.value)} />
            </Field>
            <Button type="submit" loading={saveKey.isPending} disabled={key.trim().length < 10}>
              Save key
            </Button>
            {a.source === "saved" && (
              <Button type="button" variant="ghost" loading={removeKey.isPending} onClick={() => removeKey.mutate()}>
                Remove
              </Button>
            )}
          </form>
          <div className="px-4 pb-4 sm:px-5">
            <ErrorNote error={saveKey.error ?? removeKey.error} />
          </div>
        </Card>
      </div>
    </>
  );
}
