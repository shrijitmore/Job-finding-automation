import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Mail } from "lucide-react";
import { useSearchParams } from "react-router";
import { useProfile } from "@/lib/profile";
import { type FormEvent, useState } from "react";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";

interface SettingsResponse {
  anthropic: { configured: boolean; source: "saved" | "env" | null; masked: string | null };
}

interface GmailStatus {
  serverConfigured: boolean;
  connected: boolean;
  email: string | null;
}

function GmailCard() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const id = profile?.id;
  const { data } = useQuery({ queryKey: ["gmail", id], queryFn: () => api.get<GmailStatus>(`/profiles/${id}/gmail`), enabled: Boolean(id) });
  const connect = useMutation({
    mutationFn: () => api.post<{ url: string }>(`/profiles/${id}/gmail/connect`),
    onSuccess: ({ url }) => location.assign(url),
  });
  const disconnect = useMutation({
    mutationFn: () => api.delete(`/profiles/${id}/gmail`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gmail", id] }),
  });
  const result = params.get("gmail");
  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Mail className="size-4" /> Gmail for {profile?.name ?? "this profile"}</span>}
        description="Sends email applications and reads recruiter replies on threads the agent started. Each profile connects its own account."
        actions={data?.connected ? <Badge tone="green">{data.email}</Badge> : <Badge tone="amber">Not connected</Badge>}
      />
      <div className="space-y-3 p-4 sm:p-5">
        {result === "connected" && <p className="text-sm text-emerald-600">Gmail connected.</p>}
        {result && result !== "connected" && <ErrorNote error={`Gmail connection failed: ${params.get("message") ?? result}`} />}
        {data && !data.serverConfigured && (
          <p className="text-sm text-zinc-500">The server has no Google OAuth client yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as described in the README, then connect here.</p>
        )}
        <div className="flex gap-2">
          {data?.connected ? (
            <Button variant="secondary" loading={disconnect.isPending} onClick={() => confirm("Disconnect Gmail? Email applications and reply handling stop for this profile.") && disconnect.mutate()}>
              Disconnect
            </Button>
          ) : (
            <Button loading={connect.isPending} disabled={!data?.serverConfigured} onClick={() => connect.mutate()}>
              Connect Gmail
            </Button>
          )}
        </div>
        <ErrorNote error={connect.error ?? disconnect.error} />
      </div>
    </Card>
  );
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
        <GmailCard />
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
