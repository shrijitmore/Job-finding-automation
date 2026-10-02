import { randomBytes } from "node:crypto";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.modify", "openid", "email"];

export interface GmailTokens {
  access_token: string;
  refresh_token: string;
  /** Epoch ms when the access token expires. */
  expiry_date: number;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function gmailAuthUrl(cfg: GoogleOAuthConfig, state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  // Forces a refresh token even if the user approved before.
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

async function tokenRequest(body: Record<string, string>, fetchImpl: typeof fetch): Promise<{ access_token: string; refresh_token?: string; expires_in: number; id_token?: string }> {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Google token error: ${String(json.error_description ?? json.error ?? res.status)}`);
  return json as never;
}

export async function exchangeGmailCode(cfg: GoogleOAuthConfig, code: string, fetchImpl: typeof fetch = fetch): Promise<GmailTokens> {
  const t = await tokenRequest(
    { code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" },
    fetchImpl,
  );
  if (!t.refresh_token) throw new Error("Google did not return a refresh token. Remove the app's access in your Google account and connect again.");
  return { access_token: t.access_token, refresh_token: t.refresh_token, expiry_date: Date.now() + t.expires_in * 1000 };
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface OutgoingMail {
  from?: string;
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  headers?: Record<string, string>;
}

function encodeHeader(value: string): string {
  // RFC 2047 for non-ASCII header values.
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

/** Builds an RFC 2822 message with an optional attachment. */
export function buildMime(mail: OutgoingMail): string {
  const boundary = `jfa_${randomBytes(12).toString("hex")}`;
  const headers = [
    mail.from ? `From: ${mail.from}` : null,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    "MIME-Version: 1.0",
    mail.inReplyTo ? `In-Reply-To: ${mail.inReplyTo}` : null,
    mail.references ? `References: ${mail.references}` : null,
    ...Object.entries(mail.headers ?? {}).map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean) as string[];
  const textPart = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(Buffer.from(mail.text, "utf8").toString("base64"))].join("\r\n");
  if (!mail.attachments?.length) return [...headers, textPart].join("\r\n");
  const parts = [
    `--${boundary}\r\n${textPart}`,
    ...mail.attachments.map((a) =>
      [
        `--${boundary}`,
        `Content-Type: ${a.contentType}; name="${a.filename}"`,
        `Content-Disposition: attachment; filename="${a.filename}"`,
        "Content-Transfer-Encoding: base64",
        "",
        wrap76(a.content.toString("base64")),
      ].join("\r\n"),
    ),
    `--${boundary}--`,
  ];
  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n");
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  internalDate: number;
  from: string;
  to: string;
  subject: string;
  messageId: string;
  references: string;
  text: string;
}

interface RawPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: RawPart[];
  headers?: Array<{ name: string; value: string }>;
}

function decodeBody(data?: string): string {
  return data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";
}

function findText(part: RawPart): string {
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBody(part.body.data);
  for (const p of part.parts ?? []) {
    const t = findText(p);
    if (t) return t;
  }
  if (part.mimeType === "text/html" && part.body?.data) return decodeBody(part.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return "";
}

/** Strips quoted history so only the newest reply text is classified. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:$/.test(line.trim()) || /^-{2,}\s*Original Message/i.test(line.trim()) || /^From: .+/.test(line.trim())) break;
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

export interface GmailClientOptions {
  oauth: Pick<GoogleOAuthConfig, "clientId" | "clientSecret">;
  tokens: GmailTokens;
  onTokens?: (t: GmailTokens) => void | Promise<void>;
  fetchImpl?: typeof fetch;
}

/** Minimal Gmail REST client with automatic token refresh. */
export class GmailClient {
  private tokens: GmailTokens;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GmailClientOptions) {
    this.tokens = opts.tokens;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async accessToken(): Promise<string> {
    if (this.tokens.expiry_date - 60_000 > Date.now()) return this.tokens.access_token;
    const t = await tokenRequest(
      { refresh_token: this.tokens.refresh_token, client_id: this.opts.oauth.clientId, client_secret: this.opts.oauth.clientSecret, grant_type: "refresh_token" },
      this.fetchImpl,
    );
    this.tokens = { ...this.tokens, access_token: t.access_token, expiry_date: Date.now() + t.expires_in * 1000 };
    await this.opts.onTokens?.(this.tokens);
    return this.tokens.access_token;
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Gmail API ${res.status}: ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async profile(): Promise<{ emailAddress: string }> {
    return this.api("profile");
  }

  async send(mail: OutgoingMail): Promise<{ id: string; threadId: string }> {
    const raw = Buffer.from(buildMime(mail)).toString("base64url");
    return this.api("messages/send", { method: "POST", body: JSON.stringify({ raw, threadId: mail.threadId }) });
  }

  async getThread(threadId: string): Promise<GmailMessage[]> {
    const t = await this.api<{ messages?: Array<{ id: string; threadId: string; labelIds?: string[]; internalDate: string; payload: RawPart }> }>(
      `threads/${threadId}?format=full`,
    );
    return (t.messages ?? []).map((m) => {
      const h = (name: string) => m.payload.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
      return {
        id: m.id,
        threadId: m.threadId,
        labelIds: m.labelIds ?? [],
        internalDate: Number(m.internalDate),
        from: h("From"),
        to: h("To"),
        subject: h("Subject"),
        messageId: h("Message-ID") || h("Message-Id"),
        references: h("References"),
        text: findText(m.payload),
      };
    });
  }

  async markRead(messageId: string): Promise<void> {
    await this.api(`messages/${messageId}/modify`, { method: "POST", body: JSON.stringify({ removeLabelIds: ["UNREAD"] }) });
  }
}

/** Pulls the bare address out of "Name <a@b.co>". */
export function emailAddress(header: string): string {
  return (header.match(/<([^>]+)>/)?.[1] ?? header).trim().toLowerCase();
}
