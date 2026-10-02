import * as cheerio from "cheerio";

const NOISE =
  "script, style, noscript, svg, iframe, template, nav, header, footer, aside, dialog, [role=navigation], [role=banner], [role=contentinfo], [aria-hidden=true], form[role=search], .dropdown-menu";

/**
 * Turns HTML into compact text for the AI extractor. Links are kept inline as
 * [text](absolute-url) so listing URLs survive the conversion.
 */
export function htmlToText(html: string, baseUrl: string, maxChars = 60_000): string {
  const $ = cheerio.load(html);
  $(NOISE).remove();
  $("a[href]").each((_, el) => {
    const a = $(el);
    const href = a.attr("href") ?? "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    let abs = href;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    const text = a.text().replace(/\s+/g, " ").trim();
    if (text) a.replaceWith(` [${text}](${abs}) `);
  });
  $("br").replaceWith("\n");
  $("p, div, li, tr, h1, h2, h3, h4, h5, h6, section, article").each((_, el) => {
    $(el).append("\n");
  });
  const root = $("main").length ? $("main") : $("body");
  const text = root
    .text()
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, maxChars);
}

/** Plain text from an HTML fragment such as a job description. */
export function fragmentToText(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  $("br").replaceWith("\n");
  $("p, li, h1, h2, h3, h4, div").each((_, el) => {
    $(el).append("\n");
  });
  $("li").each((_, el) => {
    $(el).prepend("- ");
  });
  return $("#root")
    .text()
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function decodeEntities(s: string): string {
  return cheerio.load(`<textarea>${s}</textarea>`)("textarea").text();
}

export interface JsonLdJob {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  datePosted?: string;
  employmentType?: string;
  remote?: boolean;
}

/** Reads schema.org JobPosting data, which many career pages embed. */
export function extractJsonLdJob(html: string): JsonLdJob | null {
  const $ = cheerio.load(html);
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    let data: unknown;
    try {
      data = JSON.parse($(el).text());
    } catch {
      continue;
    }
    const nodes = (Array.isArray(data) ? data : [data]).flatMap((d) =>
      d && typeof d === "object" && "@graph" in d ? ((d as { "@graph": unknown[] })["@graph"] ?? []) : [d],
    ) as Array<Record<string, unknown>>;
    const job = nodes.find((n) => n && (n["@type"] === "JobPosting" || (Array.isArray(n["@type"]) && n["@type"].includes("JobPosting"))));
    if (!job) continue;
    const org = job.hiringOrganization as { name?: string } | undefined;
    const loc = (Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation) as
      | { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string | { name?: string } } }
      | undefined;
    const addr = loc?.address;
    const country = typeof addr?.addressCountry === "string" ? addr.addressCountry : addr?.addressCountry?.name;
    const employment = Array.isArray(job.employmentType) ? job.employmentType.join(", ") : (job.employmentType as string | undefined);
    return {
      title: job.title as string | undefined,
      company: org?.name,
      location: [addr?.addressLocality, addr?.addressRegion, country].filter(Boolean).join(", ") || undefined,
      description: typeof job.description === "string" ? fragmentToText(job.description) : undefined,
      datePosted: job.datePosted as string | undefined,
      employmentType: employment,
      remote: job.jobLocationType === "TELECOMMUTE",
    };
  }
  return null;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IGNORED_EMAIL = /^(noreply|no-reply|privacy|support|help|info|legal|abuse|security|press|accommodations?)@|@(example|sentry|wixpress)\./i;

/** Finds an application email address in a JD, if it asks candidates to email one. */
export function findApplyEmail(text: string): string | null {
  const emails = [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.replace(/\.$/, "")))].filter((e) => !IGNORED_EMAIL.test(e));
  if (!emails.length) return null;
  const hint = /(apply|send|email|resume|cv|portfolio|reach out|write to)/i;
  for (const e of emails) {
    const idx = text.indexOf(e);
    if (hint.test(text.slice(Math.max(0, idx - 160), idx))) return e;
  }
  return null;
}
