import * as cheerio from "cheerio";
import { findApplyEmail } from "../html";
import type { RawListing, SourcePlugin } from "../types";

const ROLE_WORDS =
  /(engineer|developer|scientist|designer|manager|lead|architect|analyst|researcher|devops|sre|founding|intern|head of|director|writer|editor|marketer|product|recruiter|cto|vp)/i;
const LOCATION_WORDS = /(remote|onsite|on-site|hybrid|\b[A-Z][a-z]+,\s*[A-Z]{2}\b|san francisco|new york|london|berlin|bangalore|bengaluru|india|europe|usa|us\b|uk\b|anywhere)/i;

/** Parses the conventional "Company | Role | Location | ..." first line of a hiring comment. */
export function parseHnComment(text: string): { company: string; title: string; location: string; jobType: string } | null {
  const firstLine = text.split("\n")[0] ?? "";
  const parts = firstLine.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const company = parts[0].replace(/\s*\(.*?\)\s*/g, " ").trim();
  const rest = parts.slice(1);
  const title = rest.find((p) => ROLE_WORDS.test(p) && p.length < 140) ?? rest[0];
  const location = rest.find((p) => p !== title && LOCATION_WORDS.test(p)) ?? "";
  const jobType = rest.find((p) => /full[- ]?time|part[- ]?time|contract|freelance/i.test(p)) ?? "";
  if (!company || !title) return null;
  return { company, title, location, jobType };
}

export const hnPlugin: SourcePlugin = {
  id: "hn_whoishiring",
  async scrape(ctx) {
    let threadUrl = ctx.source.url;
    if (!/item\?id=/.test(threadUrl)) {
      const list = await ctx.fetcher.get(threadUrl);
      const $ = cheerio.load(list.body);
      const link = $("span.titleline > a, a.titlelink, a.storylink")
        .toArray()
        .map((a) => ({ text: $(a).text(), href: $(a).attr("href") ?? "" }))
        .find((a) => /who is hiring\?/i.test(a.text));
      if (!link) throw new Error("Could not find the latest Who is Hiring thread");
      threadUrl = new URL(link.href, "https://news.ycombinator.com/").toString();
    }
    const page = await ctx.fetcher.get(threadUrl);
    const $ = cheerio.load(page.body);
    const threadDate = $("span.age").first().attr("title")?.split(" ")[0] ?? "";
    const out: RawListing[] = [];
    $("tr.athing.comtr").each((_, row) => {
      if (out.length >= ctx.maxListings) return;
      const r = $(row);
      if (r.find("td.ind").attr("indent") !== "0") return;
      const comment = r.find(".commtext").first();
      if (!comment.length) return;
      comment.find("p").before("\n");
      comment.find("a").each((__, a) => {
        $(a).replaceWith($(a).attr("href") ?? $(a).text());
      });
      const text = comment.text().replace(/\n{3,}/g, "\n\n").trim();
      const parsed = parseHnComment(text);
      if (!parsed) return;
      const id = r.attr("id");
      out.push({
        ...parsed,
        url: `https://news.ycombinator.com/item?id=${id}`,
        description: text,
        postedDate: r.find("span.age").attr("title")?.split(" ")[0] ?? threadDate,
        applyEmail: findApplyEmail(text) ?? "",
      });
    });
    return out;
  },
};
