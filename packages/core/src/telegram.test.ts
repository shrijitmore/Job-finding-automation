import { describe, expect, it } from "vitest";
import { escapeHtml, sendTelegram, splitMessage } from "./telegram";

describe("telegram", () => {
  it("escapes HTML and splits long messages on line breaks", () => {
    expect(escapeHtml("<b>A & B</b>")).toBe("&lt;b&gt;A &amp; B&lt;/b&gt;");
    const parts = splitMessage(Array(300).fill("line of text that is about forty chars").join("\n"), 4000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 4000)).toBe(true);
  });

  it("posts to the Bot API and surfaces errors", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await sendTelegram({ botToken: "1:abc", chatId: "42" }, "<b>hi</b>", ok);
    expect(calls[0].url).toBe("https://api.telegram.org/bot1:abc/sendMessage");
    expect(calls[0].body).toMatchObject({ chat_id: "42", parse_mode: "HTML" });
    const bad = (async () => new Response(JSON.stringify({ description: "chat not found" }), { status: 400 })) as typeof fetch;
    await expect(sendTelegram({ botToken: "1:abc", chatId: "42" }, "x", bad)).rejects.toThrow(/chat not found/);
  });
});
