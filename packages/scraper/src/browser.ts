import type { Browser } from "playwright-core";
import type { FetchResult, Renderer } from "./http";

/**
 * Renders JS-heavy pages in headless Chromium. Every call uses a fresh, empty
 * browser context, so we are always logged out and keep no cookies between sites.
 */
export class BrowserRenderer implements Renderer {
  private browser: Promise<Browser> | null = null;

  constructor(private readonly executablePath?: string) {}

  private launch(): Promise<Browser> {
    this.browser ??= import("playwright-core").then(({ chromium }) =>
      chromium.launch({ headless: true, executablePath: this.executablePath || undefined }),
    );
    return this.browser;
  }

  async render(url: string, userAgent: string): Promise<FetchResult> {
    const browser = await this.launch();
    const context = await browser.newContext({ userAgent, javaScriptEnabled: true });
    try {
      const page = await context.newPage();
      // Skip heavy assets; we only need the DOM.
      await page.route("**/*", (route) =>
        ["image", "media", "font"].includes(route.request().resourceType()) ? route.abort() : route.continue(),
      );
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
      return {
        status: res?.status() ?? 0,
        url: page.url(),
        body: await page.content(),
        contentType: "text/html",
      };
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) await (await this.browser).close().catch(() => undefined);
    this.browser = null;
  }
}
