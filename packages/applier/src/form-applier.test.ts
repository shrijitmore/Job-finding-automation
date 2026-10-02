import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { SAMPLE_RESUME } from "@jfa/core";
import { findChromium } from "@jfa/pipeline";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FormApplier, applicationUrl } from "./form-applier";

const fx = (n: string) => readFileSync(path.join(__dirname, "..", "fixtures", n), "utf8");
const PAGES: Record<string, string> = {
  "/greenhouse/1": fx("greenhouse.html"),
  "/lever/1/apply": fx("lever.html"),
  "/ashby/1/application": fx("ashby.html"),
  "/captcha/1": fx("captcha-form.html"),
  "/sponsor/1/apply": fx("sponsorship-form.html"),
};

describe("FormApplier", () => {
  let server: Server;
  let base = "";
  const submissions: Array<{ ats: string; body: string }> = [];
  const applier = new FormApplier(findChromium());

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.method === "POST" && req.url?.startsWith("/submit/")) {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          submissions.push({ ats: req.url!.split("/")[2], body: Buffer.concat(chunks).toString("latin1") });
          res.writeHead(200, { "content-type": "text/html" }).end("<h1>Thank you for applying!</h1><p>Your application has been submitted.</p>");
        });
        return;
      }
      const page = PAGES[req.url ?? ""];
      if (!page) return res.writeHead(404).end();
      res.writeHead(200, { "content-type": "text/html" }).end(page);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await applier.close();
    await new Promise<void>((r) => server.close(() => r()));
  });

  const input = (url: string, ats: "greenhouse" | "lever" | "ashby", submit = true) => ({
    url,
    ats,
    master: SAMPLE_RESUME,
    coverNote: "Hello Ledgerly team. I build TypeScript services.",
    pdf: Buffer.from("%PDF-1.4 fake resume"),
    pdfFilename: "Jane_Doe_Resume.pdf",
    submit,
  });

  it("builds ATS application URLs", () => {
    expect(applicationUrl("lever", "https://jobs.lever.co/acme/123")).toBe("https://jobs.lever.co/acme/123/apply");
    expect(applicationUrl("ashby", "https://jobs.ashbyhq.com/acme/abc")).toBe("https://jobs.ashbyhq.com/acme/abc/application");
    expect(applicationUrl("greenhouse", "https://job-boards.greenhouse.io/acme/jobs/1")).toBe("https://job-boards.greenhouse.io/acme/jobs/1");
  });

  it("fills and submits a Greenhouse form, uploading the PDF and leaving demographics blank", async () => {
    const res = await applier.apply(input(`${base}/greenhouse/1`, "greenhouse"));
    expect(res.status).toBe("applied");
    expect(res.screenshot?.subarray(1, 4).toString()).toBe("PNG");
    const sub = submissions.find((s) => s.ats === "greenhouse")!;
    expect(sub.body).toContain('filename="Jane_Doe_Resume.pdf"');
    expect(sub.body).toContain("%PDF-1.4 fake resume");
    expect(sub.body).toMatch(/name="job_application\[first_name\]"\r\n\r\nJane/);
    expect(sub.body).toMatch(/name="job_application\[answers\]\[2\]\[answer\]"\r\n\r\n3-5 years/);
    expect(sub.body).toMatch(/name="gender"\r\n\r\n\r\n/);
    expect(res.filled).toEqual(expect.arrayContaining(["First Name*", "Email*", "Resume/CV*"]));
  });

  it("fills a Lever form including links and the cover note", async () => {
    const res = await applier.apply(input(`${base}/lever/1`, "lever"));
    expect(res.status).toBe("applied");
    const sub = submissions.find((s) => s.ats === "lever")!;
    expect(sub.body).toMatch(/name="name"\r\n\r\nJane Doe/);
    expect(sub.body).toMatch(/name="urls\[GitHub\]"\r\n\r\nhttps:\/\/github.com\/janedoe/);
    expect(sub.body).toMatch(/name="comments"\r\n\r\nHello Ledgerly team/);
  });

  it("fills a client-rendered Ashby form", async () => {
    const res = await applier.apply(input(`${base}/ashby/1`, "ashby"));
    expect(res.status).toBe("applied");
    const sub = submissions.find((s) => s.ats === "ashby")!;
    expect(sub.body).toMatch(/name="_systemfield_name"\r\n\r\nJane Doe/);
    expect(sub.body).toMatch(/name="location"\r\n\r\nRemote/);
  });

  it("skips forms with a CAPTCHA without submitting", async () => {
    const before = submissions.length;
    const res = await applier.apply(input(`${base}/captcha/1`, "greenhouse"));
    expect(res).toMatchObject({ status: "manual", reason: "The form has a CAPTCHA" });
    expect(submissions.length).toBe(before);
  });

  it("skips forms with required questions it cannot answer truthfully", async () => {
    const before = submissions.length;
    const res = await applier.apply(input(`${base}/sponsor/1`, "lever"));
    expect(res.status).toBe("manual");
    expect(res.unanswerable).toEqual(expect.arrayContaining(["Will you now or in the future require visa sponsorship? *", "Desired salary *"]));
    expect(submissions.length).toBe(before);
  });

  it("can fill without submitting", async () => {
    const before = submissions.length;
    const res = await applier.apply(input(`${base}/lever/1`, "lever", false));
    expect(res.status).toBe("manual");
    expect(res.filled.length).toBeGreaterThan(3);
    expect(submissions.length).toBe(before);
  });
});
