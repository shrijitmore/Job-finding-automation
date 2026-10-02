import { XMLParser } from "fast-xml-parser";
import { findApplyEmail, fragmentToText } from "../html";
import type { RawListing, SourcePlugin } from "../types";

interface RssItem {
  title?: string;
  link?: string;
  guid?: string | { "#text": string };
  pubDate?: string;
  description?: string;
  region?: string;
  category?: string | string[];
  "dc:creator"?: string;
  author?: string;
  type?: string;
}

/** Splits "Company: Job title", the format used by We Work Remotely and others. */
export function splitCompanyTitle(title: string, fallbackCompany: string): { company: string; title: string } {
  const m = title.match(/^(.{2,80}?):\s+(.+)$/);
  if (m) return { company: m[1].trim(), title: m[2].trim() };
  const at = title.match(/^(.+?)\s+at\s+(.{2,80})$/i);
  if (at) return { company: at[2].trim(), title: at[1].trim() };
  return { company: fallbackCompany, title: title.trim() };
}

export const rssPlugin: SourcePlugin = {
  id: "rss",
  async scrape(ctx) {
    const res = await ctx.fetcher.get(ctx.source.url, { accept: "application/rss+xml, application/xml, text/xml" });
    const parser = new XMLParser({ ignoreAttributes: true, processEntities: true, htmlEntities: true });
    const doc = parser.parse(res.body) as { rss?: { channel?: { item?: RssItem | RssItem[] } } };
    const raw = doc.rss?.channel?.item ?? [];
    const items = Array.isArray(raw) ? raw : [raw];
    return items.slice(0, ctx.maxListings).map((it): RawListing => {
      const { company, title } = splitCompanyTitle(String(it.title ?? ""), String(it["dc:creator"] ?? it.author ?? ctx.source.name));
      const description = fragmentToText(String(it.description ?? ""));
      const link = typeof it.link === "string" ? it.link : typeof it.guid === "string" ? it.guid : (it.guid?.["#text"] ?? "");
      return {
        title,
        company,
        location: String(it.region ?? ""),
        url: link.trim(),
        description,
        postedDate: it.pubDate ?? "",
        applyEmail: findApplyEmail(description) ?? "",
        jobType: String(it.type ?? ""),
      };
    });
  },
};
