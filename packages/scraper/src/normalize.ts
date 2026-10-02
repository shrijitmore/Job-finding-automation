import { createHash } from "node:crypto";
import type { AtsKind, JobType, NormalizedJob, WorkMode } from "@jfa/shared";
import type { RawListing } from "./types";

const TRACKING_PARAMS = /^(utm_|ref$|ref_|source$|src$|fbclid$|gclid$|mc_|_hs|trk|lever-source|lever-origin|gh_src$|campaign)/i;

/** Lowercases the host, drops tracking params, fragments and trailing slashes. */
export function canonicalUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.protocol = "https:";
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);
  // Greenhouse moved boards between hosts; treat them as one.
  if (u.hostname === "boards.greenhouse.io") u.hostname = "job-boards.greenhouse.io";
  u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  return u.toString();
}

const COMPANY_SUFFIX = /\b(inc|llc|ltd|limited|pvt|private|gmbh|corp|corporation|co|company|plc|sa|ag|bv|labs?)\b\.?/g;

export function normalizeCompany(name: string): string {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").replace(COMPANY_SUFFIX, " ").replace(/\s+/g, " ").trim();
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\bsr\.?\b/g, "senior")
    .replace(/\bjr\.?\b/g, "junior")
    .replace(/\beng\b/g, "engineer")
    .replace(/\s*[([].*?[)\]]\s*/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same company and title, regardless of which board listed it. */
export function dedupeHash(company: string, title: string): string {
  return createHash("sha256").update(`${normalizeCompany(company)}|${normalizeTitle(title)}`).digest("hex").slice(0, 32);
}

export function detectAts(url: string): { ats: AtsKind; board: string; jobId: string | null } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const parts = u.pathname.split("/").filter(Boolean);
  const host = u.hostname.toLowerCase();
  if (host.endsWith("greenhouse.io")) {
    const jid = u.searchParams.get("gh_jid") ?? (parts[1] === "jobs" ? parts[2] : null);
    return parts[0] ? { ats: "greenhouse", board: parts[0], jobId: jid ?? null } : null;
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") return parts[0] ? { ats: "lever", board: parts[0], jobId: parts[1] ?? null } : null;
  if (host === "jobs.ashbyhq.com") return parts[0] ? { ats: "ashby", board: parts[0], jobId: parts[1] ?? null } : null;
  return null;
}

export function normalizeJobType(raw: string | undefined | null): JobType | null {
  const s = (raw ?? "").toLowerCase();
  if (!s) return null;
  if (/free\s*lance/.test(s)) return "freelance";
  if (/contract|contractor|temporary|temp\b|fixed[- ]term/.test(s)) return "contract";
  if (/part[\s_-]?time/.test(s)) return "part-time";
  if (/full[\s_-]?time|permanent|fulltime/.test(s)) return "full-time";
  if (/intern/.test(s)) return "contract";
  return null;
}

export function detectWorkMode(...texts: Array<string | undefined | null>): WorkMode | null {
  const s = texts.filter(Boolean).join(" ").toLowerCase();
  if (/\bhybrid\b/.test(s)) return "hybrid";
  if (/\bremote\b|anywhere|work from home|wfh|distributed/.test(s)) return "remote";
  if (/on[\s-]?site|in[\s-]office|in person/.test(s)) return "onsite";
  return null;
}

const DAY = 86_400_000;

/** Parses ISO dates, epoch millis and relative phrases like "3 days ago". */
export function parsePostedDate(raw: string | number | undefined | null, now = new Date()): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") return new Date(raw > 1e12 ? raw : raw * 1000);
  const s = raw.trim().toLowerCase();
  if (/^\d{10,13}$/.test(s)) return parsePostedDate(Number(s), now);
  if (/today|just now|just posted/.test(s)) return now;
  if (/yesterday/.test(s)) return new Date(now.getTime() - DAY);
  const rel = s.match(/(\d+)\s*\+?\s*(months?|mos?|minutes?|mins?|hours?|hrs?|h|days?|d|weeks?|wks?|w)\b/);
  if (rel) {
    const unit = rel[2];
    const ms = unit.startsWith("mo") ? 30 * DAY : unit.startsWith("mi") ? 60_000 : unit.startsWith("h") ? 3_600_000 : unit.startsWith("d") ? DAY : 7 * DAY;
    return new Date(now.getTime() - Number(rel[1]) * ms);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeListing(raw: RawListing, sourceId: string, fields: string[], now = new Date()): NormalizedJob | null {
  const title = raw.title?.trim();
  const company = raw.company?.trim();
  const url = raw.url?.trim();
  if (!title || !company || !url || !/^https?:\/\//i.test(url)) return null;
  const ats = raw.ats ? { ats: raw.ats, board: raw.atsBoardToken ?? "", jobId: raw.atsJobId ?? null } : detectAts(raw.applyUrl || url);
  const posted = parsePostedDate(raw.postedDate, now);
  const email = raw.applyEmail?.trim() || null;
  return {
    title,
    company,
    location: raw.location?.trim() ?? "",
    url,
    canonicalUrl: canonicalUrl(url),
    description: raw.description?.trim() ?? "",
    postedAt: posted ? posted.toISOString() : null,
    applyEmail: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.toLowerCase() : null,
    applyUrl: raw.applyUrl ?? null,
    jobType: normalizeJobType(raw.jobType),
    workMode: (raw.workMode as WorkMode | undefined) ?? detectWorkMode(raw.location, title),
    ats: ats?.ats ?? null,
    atsBoardToken: ats?.board ?? null,
    atsJobId: ats?.jobId ?? null,
    sourceId,
    fields,
  };
}

/** Removes duplicates within one batch by canonical URL and by company + title. */
export function dedupeJobs<T extends { canonicalUrl: string; company: string; title: string }>(jobs: T[]): T[] {
  const urls = new Set<string>();
  const hashes = new Set<string>();
  const out: T[] = [];
  for (const j of jobs) {
    const h = dedupeHash(j.company, j.title);
    if (urls.has(j.canonicalUrl) || hashes.has(h)) continue;
    urls.add(j.canonicalUrl);
    hashes.add(h);
    out.push(j);
  }
  return out;
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
