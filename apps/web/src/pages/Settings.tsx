import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Mail, Send } from "lucide-react";
import { useSearchParams } from "react-router";
import { useProfile } from "@/lib/profile";
import { type FormEvent, useState } from "react";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import { formatUsd } from "@/lib/format";

interface SettingsResponse {
  llm: { provider: "anthropic" | "vertex"; model: string };
  anthropic: { configured: boolean; source: "saved" | "env" | null; masked: string | null };
  telegram: { configured: boolean; chatId: string | null; botToken: string | null };
}

function TelegramCard({ status }: { status: SettingsResponse["telegram"] }) {
  const qc = useQueryClient();
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState(status.chatId ?? "");
  const save = useMutation({
    mutationFn: () => api.put("/settings/telegram", { botToken, chatId }),
    onSuccess: () => {
      setBotToken("");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const test = useMutation({ mutationFn: () => api.post("/settings/telegram/test") });
  const remove = useMutation({ mutationFn: () => api.delete("/settings/telegram"), onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }) });
  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Send className="size-4" /> Telegram</span>}
        description="Run summaries and alerts for replies that need you. Create a bot with @BotFather, send it a message, then find your chat ID (see README)."
        actions={status.configured ? <Badge tone="green">Chat {status.chatId}</Badge> : <Badge tone="amber">Not connected</Badge>}
      />
      <form
        className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Bot token" hint={status.botToken ? `Saved: ${status.botToken}` : undefined}>
          <Input type="password" autoComplete="off" placeholder="123456:ABC..." value={botToken} onChange={(e) => setBotToken(e.target.value)} />
        </Field>
        <Field label="Chat ID">
          <Input placeholder="123456789" value={chatId} onChange={(e) => setChatId(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" loading={save.isPending} disabled={!botToken || !chatId}>
            Save
          </Button>
          {status.configured && (
            <>
              <Button type="button" variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
                Send test message
              </Button>
              <Button type="button" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()}>
                Remove
              </Button>
            </>
          )}
          {test.isSuccess && <span className="self-center text-sm text-emerald-600">Sent. Check Telegram.</span>}
        </div>
        <div className="sm:col-span-2">
          <ErrorNote error={save.error ?? test.error ?? remove.error} />
        </div>
      </form>
    </Card>
  );
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

interface UsageRow {
  profileId: string;
  profileName: string;
  purpose: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function UsageCard() {
  const { data } = useQuery({ queryKey: ["usage"], queryFn: () => api.get<UsageRow[]>("/settings/usage") });
  const total = (data ?? []).reduce((s, r) => s + r.costUsd, 0);
  return (
    <Card>
      <CardHeader title="AI usage, last 30 days" description={`Total ${formatUsd(total)} across all profiles.`} />
      {data?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium sm:px-5">Profile</th>
                <th className="px-4 py-2 font-medium">Step</th>
                <th className="px-4 py-2 text-right font-medium">Calls</th>
                <th className="px-4 py-2 text-right font-medium">Tokens</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.map((r) => (
                <tr key={`${r.profileId}-${r.purpose}`}>
                  <td className="px-4 py-2 sm:px-5">{r.profileName}</td>
                  <td className="px-4 py-2 text-zinc-500">{r.purpose.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.calls}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{(r.inputTokens + r.outputTokens).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums sm:px-5">{formatUsd(r.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-4 text-sm text-zinc-500 sm:p-5">No model calls yet.</p>
      )}
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
        <TelegramCard status={data.telegram} />
        {data.llm?.provider === "vertex" ? (
          <Card>
            <CardHeader
              title={<span className="inline-flex items-center gap-2"><KeyRound className="size-4" /> AI model</span>}
              description="Gemini on Google Cloud Vertex AI, using the server's service account. Used for parsing, scoring, tailoring, validation and reply classification."
              actions={<Badge tone="green">{data.llm.model}</Badge>}
            />
          </Card>
        ) : (
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
        )}
        <UsageCard />
      </div>
    </>
  );
}
