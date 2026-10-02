export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Telegram caps messages at 4096 characters; long summaries are split on line breaks. */
export function splitMessage(text: string, max = 4000): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur.length + line.length + 1 > max) {
      out.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line.slice(0, max);
  }
  if (cur) out.push(cur);
  return out;
}

/** Sends an HTML-formatted message through the Telegram Bot API. */
export async function sendTelegram(cfg: TelegramConfig, html: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  for (const part of splitMessage(html)) {
    const res = await fetchImpl(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text: part, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { description?: string };
      throw new Error(`Telegram error ${res.status}: ${body.description ?? "unknown"}`);
    }
  }
}
