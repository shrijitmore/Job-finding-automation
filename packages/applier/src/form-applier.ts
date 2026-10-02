import type { Browser, Page } from "playwright-core";
import type { AtsKind, MasterResume } from "@jfa/shared";
import { planAnswers, type FormField } from "./answers";

export interface FormApplyInput {
  url: string;
  ats: AtsKind;
  master: MasterResume;
  coverNote: string;
  pdf: Buffer;
  pdfFilename: string;
  /** When false, fills the form and stops before submitting (used for previews and tests). */
  submit: boolean;
}

export interface FormApplyResult {
  status: "applied" | "manual" | "unconfirmed";
  reason?: string;
  screenshot?: Buffer;
  filled: string[];
  unanswerable: string[];
}

const CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  'iframe[src*="challenges.cloudflare.com"]',
  ".g-recaptcha",
  ".h-captcha",
  ".cf-turnstile",
  'script[src*="recaptcha/api.js"]',
  'script[src*="recaptcha/enterprise.js"]',
  'script[src*="hcaptcha.com"]',
];

const CONFIRMATION = /thank(s| you) for (applying|your (application|interest))|application (has been |was )?(submitted|received)|we('ve| have) received your application|successfully (submitted|applied)/i;

/** Builds the application form URL for each ATS from the job page URL. */
export function applicationUrl(ats: AtsKind, jobUrl: string): string {
  const u = new URL(jobUrl);
  if (ats === "lever" && !u.pathname.endsWith("/apply")) u.pathname = `${u.pathname.replace(/\/$/, "")}/apply`;
  if (ats === "ashby" && !u.pathname.endsWith("/application")) u.pathname = `${u.pathname.replace(/\/$/, "")}/application`;
  return u.toString();
}

async function hasCaptcha(page: Page): Promise<boolean> {
  for (const sel of CAPTCHA_SELECTORS) if ((await page.locator(sel).count()) > 0) return true;
  return false;
}

/** Collects visible form controls with their labels. Radio groups become one field. */
async function collectFields(page: Page): Promise<FormField[]> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(el as HTMLElement);
      // File inputs are often visually hidden behind a styled button.
      return (el as HTMLInputElement).type === "file" || (r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none");
    };
    const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    const labelFor = (el: HTMLElement): string => {
      const aria = el.getAttribute("aria-label");
      if (aria) return aria;
      const by = el.getAttribute("aria-labelledby");
      if (by) return by.split(/\s+/).map((id) => text(document.getElementById(id))).join(" ");
      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) return text(l);
      }
      const wrap = el.closest("label");
      if (wrap) return text(wrap);
      const legend = el.closest("fieldset")?.querySelector("legend");
      if (legend) return text(legend);
      const box = el.closest(".field, .application-question, .application-field, [class*='question'], [class*='Field'], li, .form-group");
      const lab = box?.querySelector("label, .application-label, [class*='label'], [class*='Label']");
      if (lab) return text(lab);
      return el.getAttribute("placeholder") ?? el.getAttribute("name") ?? "";
    };
    const out: Array<Record<string, unknown>> = [];
    const radios = new Map<string, HTMLInputElement[]>();
    let idx = 0;
    for (const el of Array.from(document.querySelectorAll("input, textarea, select")) as HTMLInputElement[]) {
      const type = (el.getAttribute("type") ?? (el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : "text")).toLowerCase();
      if (["hidden", "submit", "button", "reset", "image", "search"].includes(type) || el.disabled || !visible(el)) continue;
      if (type === "radio") {
        const list = radios.get(el.name) ?? [];
        list.push(el);
        radios.set(el.name, list);
        continue;
      }
      el.setAttribute("data-jfa-idx", String(idx));
      const label = labelFor(el);
      out.push({
        idx: idx++,
        tag: el.tagName.toLowerCase(),
        type,
        name: el.name ?? "",
        id: el.id ?? "",
        label,
        required: el.required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(label),
        options: el.tagName === "SELECT" ? Array.from((el as unknown as HTMLSelectElement).options).map((o) => o.text.trim()).filter(Boolean) : [],
      });
    }
    for (const [name, group] of radios) {
      const first = group[0];
      first.setAttribute("data-jfa-idx", String(idx));
      const fieldset = first.closest("fieldset");
      const question = text(fieldset?.querySelector("legend")) || labelFor(first.closest("[role=radiogroup]") as HTMLElement ?? first);
      out.push({
        idx: idx++,
        tag: "input",
        type: "radio",
        name,
        id: first.id ?? "",
        label: question,
        required: group.some((r) => r.required) || /\*\s*$/.test(question),
        options: group.map((r) => labelFor(r)),
      });
    }
    return out as unknown as never;
  });
}

/**
 * Fills and submits Greenhouse, Lever and Ashby application forms with answers taken only
 * from the profile. Forms with a CAPTCHA, or with required questions the profile can't
 * answer truthfully, are left for the user to apply manually.
 */
export class FormApplier {
  private browser: Promise<Browser> | null = null;

  constructor(private readonly executablePath?: string) {}

  private launch(): Promise<Browser> {
    this.browser ??= import("playwright-core").then(({ chromium }) => chromium.launch({ headless: true, executablePath: this.executablePath || undefined }));
    return this.browser;
  }

  async apply(input: FormApplyInput): Promise<FormApplyResult> {
    const browser = await this.launch();
    // Fresh context every time: logged out, no cookies carried between sites.
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const shot = async () => page.screenshot({ fullPage: true }).catch(() => undefined);
    try {
      await page.goto(applicationUrl(input.ats, input.url), { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);

      // Some boards show the job first and reveal the form behind an "Apply" button.
      const emailVisible = await page
        .locator('input[type="email"], input[name*="email" i], input[id*="email" i]')
        .first()
        .isVisible()
        .catch(() => false);
      if (!emailVisible) {
        const opener = page.getByRole("button", { name: /^apply( for this job| now)?$/i }).or(page.getByRole("link", { name: /^apply( for this job| now)?$/i }));
        if (await opener.count()) {
          await opener.first().click();
          await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
        }
      }
      if (await hasCaptcha(page)) return { status: "manual", reason: "The form has a CAPTCHA", screenshot: await shot(), filled: [], unanswerable: [] };

      const fields = await collectFields(page);
      if (!fields.some((f) => f.type === "file")) {
        return { status: "manual", reason: "No resume upload field found on the form", screenshot: await shot(), filled: [], unanswerable: [] };
      }
      const plan = planAnswers(fields, { master: input.master, coverNote: input.coverNote });
      const unanswerable = plan.unanswerable.map((f) => f.label || f.name);
      if (unanswerable.length) {
        return {
          status: "manual",
          reason: `Needs your answer: ${unanswerable.slice(0, 5).join("; ")}`,
          screenshot: await shot(),
          filled: [],
          unanswerable,
        };
      }

      const filled: string[] = [];
      for (const { field, answer } of plan.answers) {
        const loc = page.locator(`[data-jfa-idx="${field.idx}"]`);
        if (answer.kind === "resume") await loc.setInputFiles({ name: input.pdfFilename, mimeType: "application/pdf", buffer: input.pdf });
        else if (answer.kind === "text") await loc.fill(answer.value);
        else if (answer.kind === "select") await loc.selectOption({ label: answer.value });
        else if (answer.kind === "check") await loc.check();
        else continue;
        filled.push(field.label || field.name);
        await page.waitForTimeout(80 + Math.random() * 170);
      }

      if (await hasCaptcha(page)) return { status: "manual", reason: "A CAPTCHA appeared while filling the form", screenshot: await shot(), filled, unanswerable: [] };
      if (!input.submit) return { status: "manual", reason: "Filled but not submitted (preview)", screenshot: await shot(), filled, unanswerable: [] };

      const submit = page
        .locator('button[type="submit"], input[type="submit"]')
        .or(page.getByRole("button", { name: /submit( application)?|send application/i }));
      if (!(await submit.count())) return { status: "manual", reason: "Submit button not found", screenshot: await shot(), filled, unanswerable: [] };
      await submit.first().click();
      try {
        await page.waitForFunction((src) => new RegExp(src, "i").test(document.body.innerText), CONFIRMATION.source, { timeout: 25_000 });
        return { status: "applied", screenshot: await shot(), filled, unanswerable: [] };
      } catch {
        return { status: "unconfirmed", reason: "Submitted, but no confirmation message appeared. Check the screenshot.", screenshot: await shot(), filled, unanswerable: [] };
      }
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) await (await this.browser).close().catch(() => undefined);
    this.browser = null;
  }
}
