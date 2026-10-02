import { decodeEntities, fragmentToText } from "../html";
import { detectAts } from "../normalize";
import type { RawListing, ScrapeContext, SourcePlugin } from "../types";

function boardToken(ctx: ScrapeContext, ats: "greenhouse" | "lever" | "ashby"): string {
  const configured = ctx.source.config as { boardToken?: string };
  if (configured.boardToken) return configured.boardToken;
  const d = detectAts(ctx.source.url);
  if (!d || d.ats !== ats) throw new Error(`Cannot find a ${ats} board name in ${ctx.source.url}`);
  return d.board;
}

async function getJson<T>(ctx: ScrapeContext, url: string): Promise<T> {
  const res = await ctx.fetcher.get(url, { accept: "application/json" });
  return JSON.parse(res.body) as T;
}

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  company_name?: string;
  location?: { name?: string };
  updated_at?: string;
  first_published?: string;
  content?: string;
  metadata?: Array<{ name: string; value: unknown }> | null;
}

export const greenhousePlugin: SourcePlugin = {
  id: "greenhouse",
  async scrape(ctx) {
    const token = boardToken(ctx, "greenhouse");
    const data = await getJson<{ jobs: GreenhouseJob[] }>(ctx, `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
    return data.jobs.slice(0, ctx.maxListings).map(
      (j): RawListing => ({
        title: j.title,
        company: j.company_name || ctx.source.name,
        location: j.location?.name ?? "",
        url: j.absolute_url,
        description: j.content ? fragmentToText(decodeEntities(j.content)) : "",
        postedDate: j.first_published ?? j.updated_at ?? "",
        applyEmail: "",
        applyUrl: j.absolute_url,
        jobType: String(j.metadata?.find((m) => /employment|type/i.test(m.name))?.value ?? ""),
        ats: "greenhouse",
        atsBoardToken: token,
        atsJobId: String(j.id),
      }),
    );
  },
};

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl: string;
  createdAt?: number;
  categories?: { commitment?: string; location?: string; allLocations?: string[] };
  workplaceType?: string;
  descriptionPlain?: string;
  lists?: Array<{ text: string; content: string }>;
  additionalPlain?: string;
}

export const leverPlugin: SourcePlugin = {
  id: "lever",
  async scrape(ctx) {
    const token = boardToken(ctx, "lever");
    const host = new URL(ctx.source.url).hostname.includes(".eu.") ? "api.eu.lever.co" : "api.lever.co";
    const data = await getJson<LeverPosting[]>(ctx, `https://${host}/v0/postings/${token}?mode=json`);
    return data.slice(0, ctx.maxListings).map(
      (p): RawListing => ({
        title: p.text,
        company: ctx.source.name,
        location: p.categories?.allLocations?.join("; ") || p.categories?.location || "",
        url: p.hostedUrl,
        description: [
          p.descriptionPlain ?? "",
          ...(p.lists ?? []).map((l) => `${l.text}\n${fragmentToText(l.content)}`),
          p.additionalPlain ?? "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        postedDate: p.createdAt ? new Date(p.createdAt).toISOString() : "",
        applyEmail: "",
        applyUrl: p.applyUrl,
        jobType: p.categories?.commitment ?? "",
        workMode: p.workplaceType === "remote" ? "remote" : p.workplaceType === "hybrid" ? "hybrid" : p.workplaceType === "onsite" ? "onsite" : undefined,
        ats: "lever",
        atsBoardToken: token,
        atsJobId: p.id,
      }),
    );
  },
};

interface AshbyJob {
  id?: string;
  title: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  employmentType?: string;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean | null;
  workplaceType?: string | null;
  jobUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
}

export const ashbyPlugin: SourcePlugin = {
  id: "ashby",
  async scrape(ctx) {
    const token = boardToken(ctx, "ashby");
    const data = await getJson<{ jobs: AshbyJob[] }>(ctx, `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`);
    return data.jobs
      .filter((j) => j.isListed !== false)
      .slice(0, ctx.maxListings)
      .map((j): RawListing => {
        const wt = (j.workplaceType ?? "").toLowerCase();
        return {
          title: j.title,
          company: ctx.source.name,
          location: [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean).join("; "),
          url: j.jobUrl,
          description: j.descriptionPlain ?? "",
          postedDate: j.publishedAt ?? "",
          applyEmail: "",
          applyUrl: j.applyUrl ?? j.jobUrl,
          jobType: (j.employmentType ?? "").replace(/([a-z])([A-Z])/g, "$1-$2"),
          workMode: j.isRemote || wt === "remote" ? "remote" : wt === "hybrid" ? "hybrid" : wt === "onsite" ? "onsite" : undefined,
          ats: "ashby",
          atsBoardToken: token,
          atsJobId: j.id ?? j.jobUrl.split("/").pop(),
        };
      });
  },
};
