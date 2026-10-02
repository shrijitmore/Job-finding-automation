import * as cheerio from "cheerio";
import { extractListings } from "../extractor";
import { extractJsonLdJob, findApplyEmail, htmlToText } from "../html";
import { contentHash, detectAts, canonicalUrl } from "../normalize";
import type { RawListing, ScrapeContext, SourcePlugin } from "../types";
import { ashbyPlugin, greenhousePlugin, leverPlugin } from "./ats";

const BOARD_PATTERNS: Array<[RegExp, (token: string) => string]> = [
  [/greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9_-]+)/gi, (t) => `https://job-boards.greenhouse.io/${t}`],
  [/(?:job-)?boards\.greenhouse\.io\/(?!embed\b)([a-z0-9_-]+)/gi, (t) => `https://job-boards.greenhouse.io/${t}`],
  [/jobs\.(?:eu\.)?lever\.co\/([a-z0-9_-]+)/gi, (t) => `https://jobs.lever.co/${t}`],
  [/jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/gi, (t) => `https://jobs.ashbyhq.com/${t}`],
];

/**
 * If a company career page is powered by a single public ATS board, return that board's URL.
 * Pages that link to several different boards are job boards, not career pages, and return null.
 */
export function findEmbeddedBoard(html: string): string | null {
  const boards = new Map<string, number>();
  for (const [re, toUrl] of BOARD_PATTERNS) {
    for (const m of html.matchAll(re)) {
      const url = toUrl(m[1].toLowerCase());
      boards.set(url, (boards.get(url) ?? 0) + 1);
    }
  }
  if (boards.size !== 1) return null;
  const [[url, count]] = [...boards.entries()];
  const embedded = /greenhouse\.io\/embed\/job_board|jobs\.ashbyhq\.com\/[^"']+\/embed|lever\.co\/[^"']+\?.*embed/i.test(html);
  return embedded || count >= 2 ? url : null;
}

async function fetchDetail(ctx: ScrapeContext, listing: RawListing): Promise<RawListing> {
  const res = await ctx.fetcher.get(listing.url, { render: Boolean(ctx.source.config.render) });
  const ld = extractJsonLdJob(res.body);
  const text = ld?.description || htmlToText(res.body, res.url, 15_000);
  const $ = cheerio.load(res.body);
  const atsLink = $("a[href]")
    .toArray()
    .map((a) => $(a).attr("href") ?? "")
    .find((h) => detectAts(h)?.jobId);
  return {
    ...listing,
    title: listing.title || ld?.title || "",
    company: listing.company || ld?.company || "",
    location: listing.location || ld?.location || "",
    description: text.length > listing.description.length ? text : listing.description,
    postedDate: listing.postedDate || ld?.datePosted || "",
    jobType: listing.jobType || ld?.employmentType || "",
    workMode: listing.workMode ?? (ld?.remote ? "remote" : undefined),
    applyEmail: listing.applyEmail || findApplyEmail(text) || "",
    applyUrl: listing.applyUrl ?? (atsLink ? new URL(atsLink, res.url).toString() : undefined),
  };
}

export const genericPlugin: SourcePlugin = {
  id: "generic",
  async scrape(ctx) {
    const page = await ctx.fetcher.get(ctx.source.url, { render: Boolean(ctx.source.config.render) });

    const board = findEmbeddedBoard(page.body);
    if (board) {
      ctx.log.info(`Career page uses a public ATS board, reading its JSON instead`, { board });
      const plugin = board.includes("greenhouse") ? greenhousePlugin : board.includes("lever") ? leverPlugin : ashbyPlugin;
      return plugin.scrape({ ...ctx, source: { ...ctx.source, url: board } });
    }

    const text = htmlToText(page.body, page.url);
    const hash = contentHash(text);
    const cached = await ctx.cache.get(ctx.source.url);
    let listings: RawListing[];
    if (cached && cached.contentHash === hash && Array.isArray(cached.extracted)) {
      ctx.log.info("Listing page unchanged, reusing cached extraction");
      listings = cached.extracted as RawListing[];
    } else {
      if (!ctx.llm) throw new Error("Generic sources need a Claude API key");
      const jobs = await extractListings(ctx.llm, text, page.url);
      listings = jobs.map((j) => ({
        title: j.title,
        company: j.company,
        location: j.location,
        url: j.url ? new URL(j.url, page.url).toString() : page.url,
        description: j.description,
        postedDate: j.posted_date,
        applyEmail: j.apply_email,
        jobType: j.job_type,
      }));
      await ctx.cache.set(ctx.source.url, hash, listings);
    }

    listings = listings.slice(0, ctx.maxListings);
    if (ctx.source.config.followDetails === false) return listings;

    // Follow each new listing to its detail page for the full JD.
    const out: RawListing[] = [];
    let details = 0;
    for (const l of listings) {
      const ownPage = canonicalUrl(l.url) !== canonicalUrl(page.url);
      if (!ownPage || details >= ctx.maxDetails || (await ctx.isKnown(l.url)) || l.description.length > 1500) {
        out.push(l);
        continue;
      }
      details++;
      try {
        out.push(await fetchDetail(ctx, l));
      } catch (err) {
        ctx.log.warn(`Detail page failed, keeping listing summary`, { url: l.url, error: (err as Error).message });
        out.push(l);
        if ((err as Error).name === "BlockedError") break;
      }
    }
    return out;
  },
};
