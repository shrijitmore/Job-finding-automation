import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Browser } from "puppeteer-core";
import type { ResumeDoc } from "./document";
import { renderResumeHtml } from "./templates";

const CANDIDATE_PATHS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/ms-playwright/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
];

/** Chromium builds installed by Playwright, e.g. ~/.cache/ms-playwright/chromium-1194. */
function playwrightChromiums(): string[] {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), ".cache", "ms-playwright"), "/ms-playwright"].filter(Boolean) as string[];
  const out: string[] = [];
  for (const root of roots) {
    try {
      for (const dir of readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
        out.push(path.join(root, dir, "chrome-linux", "chrome"), path.join(root, dir, "chrome-linux64", "chrome"));
      }
    } catch {
      /* missing root */
    }
  }
  return out;
}

export function findChromium(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const found = [...CANDIDATE_PATHS, ...playwrightChromiums()].find((p) => existsSync(p));
  if (!found) throw new Error("No Chromium found for PDF rendering. Set CHROMIUM_PATH.");
  return found;
}

export async function countPdfPages(pdf: Uint8Array): Promise<number> {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  return doc.numPages;
}

/** Puppeteer-based PDF renderer. Shrinks type slightly when needed to fit one page. */
export class PdfRenderer {
  private browser: Promise<Browser> | null = null;

  constructor(private readonly executablePath?: string) {}

  private launch(): Promise<Browser> {
    this.browser ??= import("puppeteer-core").then((p) =>
      p.default.launch({
        executablePath: findChromium(this.executablePath),
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      }),
    );
    return this.browser;
  }

  async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await this.launch();
    const page = await browser.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  /** Renders the resume, trying slightly smaller type until it fits on one page. */
  async renderResume(doc: ResumeDoc): Promise<{ pdf: Buffer; pageCount: number; scale: number; html: string }> {
    let last: { pdf: Buffer; pageCount: number; scale: number; html: string } | null = null;
    for (const scale of [1, 0.95, 0.9, 0.86]) {
      const html = renderResumeHtml(doc, scale);
      const pdf = await this.htmlToPdf(html);
      const pageCount = await countPdfPages(pdf);
      last = { pdf, pageCount, scale, html };
      if (pageCount === 1) break;
    }
    return last!;
  }

  async close(): Promise<void> {
    if (this.browser) await (await this.browser).close().catch(() => undefined);
    this.browser = null;
  }
}
