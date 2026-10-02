import { describe, expect, it } from "vitest";
import { GmailClient, buildMime, emailAddress, gmailAuthUrl, stripQuoted } from "./gmail";

describe("gmail helpers", () => {
  it("builds a MIME message with a PDF attachment", () => {
    const raw = buildMime({
      from: "me@x.co",
      to: "jobs@acme.co",
      subject: "Application: Engineer (Jane Doe)",
      text: "Hello",
      attachments: [{ filename: "Jane_Doe_Resume.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.4") }],
      headers: { "X-JFA-Application": "abc" },
    });
    expect(raw).toContain("To: jobs@acme.co");
    expect(raw).toContain("X-JFA-Application: abc");
    expect(raw).toMatch(/Content-Type: multipart\/mixed; boundary="jfa_[0-9a-f]+"/);
    expect(raw).toContain('filename="Jane_Doe_Resume.pdf"');
    expect(raw).toContain(Buffer.from("%PDF-1.4").toString("base64"));
    expect(raw).toContain(Buffer.from("Hello").toString("base64"));
  });

  it("encodes non-ASCII subjects", () => {
    expect(buildMime({ to: "a@b.co", subject: "Bewerbung für Designer", text: "x" })).toContain("Subject: =?UTF-8?B?");
  });

  it("strips quoted history and parses addresses", () => {
    expect(stripQuoted("Thanks, can you send your portfolio?\n\nOn Mon, Oct 1, 2026 at 9:00 AM Jane <j@x.co> wrote:\n> old text")).toBe("Thanks, can you send your portfolio?");
    expect(emailAddress('"Sam Recruiter" <Sam@Acme.co>')).toBe("sam@acme.co");
  });

  it("builds an offline consent URL", () => {
    const u = new URL(gmailAuthUrl({ clientId: "id", clientSecret: "s", redirectUri: "https://api/cb" }, "st"));
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("state")).toBe("st");
  });

  it("refreshes expired tokens and reports them", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "new", expires_in: 3600 }), { status: 200 });
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer new");
      return new Response(JSON.stringify({ id: "m1", threadId: "t1" }), { status: 200 });
    }) as typeof fetch;
    let saved: unknown;
    const client = new GmailClient({
      oauth: { clientId: "id", clientSecret: "s" },
      tokens: { access_token: "old", refresh_token: "r", expiry_date: Date.now() - 1000 },
      onTokens: (t) => {
        saved = t;
      },
      fetchImpl,
    });
    const res = await client.send({ to: "a@b.co", subject: "x", text: "y" });
    expect(res).toEqual({ id: "m1", threadId: "t1" });
    expect(saved).toMatchObject({ access_token: "new", refresh_token: "r" });
    expect(calls[1]).toContain("/messages/send");
  });
});
