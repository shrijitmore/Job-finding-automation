import type { Preferences } from "@jfa/shared";
import { matchRole, targetRoles } from "./roles";

export interface FilterableJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  postedAt: Date | null;
  firstSeenAt: Date;
  jobType: string | null;
  workMode: string | null;
}

export interface FilterContext {
  prefs: Preferences;
  now: Date;
  /** Companies applied to recently (normalized name -> last applied date). */
  recentCompanies: Map<string, Date>;
  cooldownDays: number;
  /** Job ids this profile already has an application row for. */
  seenJobIds: Set<string>;
}

export interface FilterResult<J> {
  kept: J[];
  rejected: Array<{ job: J; reason: string }>;
}

export function companyKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(inc|llc|ltd|limited|pvt|gmbh|corp|co|labs?)\b/g, "").trim();
}

/** Highest "N+ years" style requirement stated in a JD, or null. */
export function requiredYears(text: string): number | null {
  const re = /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|to|–)\s*\d{1,2}\s*)?\+?\s*years?(?:'|’)?\s+(?:of\s+)?(?:[a-z/.+-]+\s+){0,3}?(?:experience|exp\b)/gi;
  let min: number | null = null;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1]);
    if (n > 0 && n < 30) min = min === null ? n : Math.max(min, n);
  }
  return min;
}

function containsWord(haystack: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return false;
  return new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i").test(haystack);
}

/**
 * Deterministic filters that run before any Claude call. Each rejected job carries a
 * human-readable reason that is shown in the run log.
 */
export function hardFilter<J extends FilterableJob>(jobs: J[], ctx: FilterContext): FilterResult<J> {
  const { prefs, now } = ctx;
  const roles = targetRoles(prefs);
  const maxAgeMs = prefs.maxPostedDays * 86_400_000;
  const kept: J[] = [];
  const rejected: Array<{ job: J; reason: string }> = [];

  for (const job of jobs) {
    const reject = (reason: string) => rejected.push({ job, reason });
    const text = `${job.title}\n${job.description}`;
    const posted = job.postedAt ?? job.firstSeenAt;

    if (ctx.seenJobIds.has(job.id)) {
      reject("Already processed for this profile");
      continue;
    }
    if (now.getTime() - posted.getTime() > maxAgeMs) {
      reject(`Posted more than ${prefs.maxPostedDays} days ago`);
      continue;
    }
    if (roles.length && !matchRole(job.title, roles)) {
      reject("Title does not match any target role");
      continue;
    }
    const company = companyKey(job.company);
    if (prefs.excludedCompanies.some((c) => companyKey(c) === company)) {
      reject("Excluded company");
      continue;
    }
    const kw = prefs.excludedKeywords.find((k) => containsWord(text, k));
    if (kw) {
      reject(`Contains excluded keyword "${kw}"`);
      continue;
    }
    if (job.jobType && prefs.jobTypes.length && !prefs.jobTypes.includes(job.jobType as never)) {
      reject(`Job type ${job.jobType} not wanted`);
      continue;
    }
    if (job.workMode && prefs.workModes.length && !prefs.workModes.includes(job.workMode as never)) {
      reject(`Work mode ${job.workMode} not wanted`);
      continue;
    }
    if (prefs.locations.length && job.workMode !== "remote") {
      const loc = job.location.toLowerCase();
      const ok = !loc || prefs.locations.some((l) => loc.includes(l.trim().toLowerCase())) || /remote|anywhere/.test(loc);
      if (!ok) {
        reject(`Location "${job.location}" not in preferred locations`);
        continue;
      }
    }
    const years = requiredYears(job.description);
    if (years !== null && years > prefs.maxYears) {
      reject(`Asks for ${years}+ years, above your max of ${prefs.maxYears}`);
      continue;
    }
    if (years !== null && years < prefs.minYears) {
      reject(`Asks for ${years}+ years, below your min of ${prefs.minYears}`);
      continue;
    }
    const last = ctx.recentCompanies.get(company);
    if (last && now.getTime() - last.getTime() < ctx.cooldownDays * 86_400_000) {
      reject(`Applied to ${job.company} within the last ${ctx.cooldownDays} days`);
      continue;
    }
    kept.push(job);
  }
  return { kept, rejected };
}
