import type { Field } from "./fields";

export const SOURCE_PLUGINS = ["greenhouse", "lever", "ashby", "rss", "hn_whoishiring", "generic"] as const;
export type SourcePluginId = (typeof SOURCE_PLUGINS)[number];

export const PLUGIN_LABELS: Record<SourcePluginId, string> = {
  greenhouse: "Greenhouse board (public JSON)",
  lever: "Lever board (public JSON)",
  ashby: "Ashby board (public JSON)",
  rss: "RSS feed",
  hn_whoishiring: "HN Who is Hiring",
  generic: "Web page (AI extractor)",
};

export interface SourceSeed {
  name: string;
  plugin: SourcePluginId;
  url: string;
  fields: Field[];
  config?: {
    /** Render with a headless browser before extracting (JS-heavy sites). */
    render?: boolean;
    /** Max listings taken per run. */
    maxListings?: number;
    /** Follow each listing to its detail page for the full JD. */
    followDetails?: boolean;
  };
  note?: string;
}

const ENG_AI: Field[] = ["engineering", "ai", "leadership"];
const ALL_TECH: Field[] = ["engineering", "ai", "product", "design", "marketing", "leadership"];

/** Sources added to every new account. All editable and removable in the UI. */
export const SEED_SOURCES: SourceSeed[] = [
  // Company career pages on public ATS boards
  { name: "Anthropic", plugin: "greenhouse", url: "https://job-boards.greenhouse.io/anthropic", fields: ALL_TECH },
  { name: "Vercel", plugin: "greenhouse", url: "https://job-boards.greenhouse.io/vercel", fields: ALL_TECH },
  { name: "Stripe", plugin: "greenhouse", url: "https://job-boards.greenhouse.io/stripe", fields: ALL_TECH },
  { name: "Databricks", plugin: "greenhouse", url: "https://job-boards.greenhouse.io/databricks", fields: ALL_TECH },
  { name: "Figma", plugin: "greenhouse", url: "https://job-boards.greenhouse.io/figma", fields: [...ALL_TECH] },
  { name: "Razorpay", plugin: "greenhouse", url: "https://job-boards.greenhouse.io/razorpaysoftwareprivatelimited", fields: ALL_TECH },
  { name: "Coinbase", plugin: "greenhouse", url: "https://job-boards.greenhouse.io/coinbase", fields: [...ALL_TECH, "web3"] },
  { name: "Palantir", plugin: "lever", url: "https://jobs.lever.co/palantir", fields: ALL_TECH },
  { name: "CRED", plugin: "lever", url: "https://jobs.lever.co/cred", fields: ALL_TECH },
  { name: "Zeta", plugin: "lever", url: "https://jobs.lever.co/zeta", fields: ALL_TECH },
  { name: "OpenAI", plugin: "ashby", url: "https://jobs.ashbyhq.com/openai", fields: ALL_TECH },
  { name: "Linear", plugin: "ashby", url: "https://jobs.ashbyhq.com/linear", fields: ALL_TECH },
  { name: "Ramp", plugin: "ashby", url: "https://jobs.ashbyhq.com/ramp", fields: ALL_TECH },
  { name: "Notion", plugin: "ashby", url: "https://jobs.ashbyhq.com/notion", fields: ALL_TECH },
  { name: "Cursor", plugin: "ashby", url: "https://jobs.ashbyhq.com/cursor", fields: ALL_TECH },
  { name: "ElevenLabs", plugin: "ashby", url: "https://jobs.ashbyhq.com/elevenlabs", fields: ALL_TECH },

  // Engineering and AI boards
  { name: "Wellfound", plugin: "generic", url: "https://wellfound.com/jobs", fields: ENG_AI, config: { render: true }, note: "Often bot-protected. Logged and skipped when blocked." },
  { name: "Cutshort", plugin: "generic", url: "https://cutshort.io/jobs", fields: ENG_AI, config: { render: true } },
  { name: "Instahyre", plugin: "generic", url: "https://www.instahyre.com/search-jobs/", fields: ENG_AI, config: { render: true } },
  { name: "YC Work at a Startup", plugin: "generic", url: "https://www.workatastartup.com/jobs", fields: ENG_AI, config: { render: true } },
  { name: "RemoteOK", plugin: "generic", url: "https://remoteok.com/remote-dev-jobs", fields: ENG_AI, config: { render: true } },
  { name: "We Work Remotely: Programming", plugin: "rss", url: "https://weworkremotely.com/categories/remote-programming-jobs.rss", fields: ENG_AI },
  { name: "We Work Remotely: DevOps", plugin: "rss", url: "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss", fields: ["engineering"] },
  { name: "HN Who is Hiring", plugin: "hn_whoishiring", url: "https://news.ycombinator.com/submitted?id=whoishiring", fields: ENG_AI, config: { maxListings: 60 } },

  // Web3
  { name: "web3.career", plugin: "generic", url: "https://web3.career/", fields: ["web3"] },
  { name: "Crypto Jobs List", plugin: "generic", url: "https://cryptojobslist.com/", fields: ["web3"] },
  { name: "CryptocurrencyJobs", plugin: "generic", url: "https://cryptocurrencyjobs.co/", fields: ["web3"], config: { render: true } },
];

/**
 * Researched boards for creative, video, content, product and marketing roles.
 * Not seeded: the owner confirms each one in the Sources page before it is added.
 */
export const PROPOSED_SOURCES: SourceSeed[] = [
  // Design, video and content
  { name: "Dribbble Jobs", plugin: "generic", url: "https://dribbble.com/jobs", fields: ["design"], note: "Product, UI, brand and motion design roles." },
  { name: "Authentic Jobs", plugin: "generic", url: "https://authenticjobs.com/", fields: ["design", "content"], note: "Long-running board for designers, writers and creative developers." },
  { name: "YT Jobs", plugin: "generic", url: "https://ytjobs.co/job/search/all_categories", fields: ["video", "content", "design"], config: { render: true }, note: "YouTube editors, thumbnail designers, scriptwriters and producers." },
  { name: "Remotive: Design", plugin: "generic", url: "https://remotive.com/remote-jobs/design", fields: ["design", "video"] },
  { name: "Remotive: Writing", plugin: "generic", url: "https://remotive.com/remote-jobs/writing", fields: ["content"] },
  { name: "We Work Remotely: Design", plugin: "rss", url: "https://weworkremotely.com/categories/remote-design-jobs.rss", fields: ["design", "video"] },
  { name: "We Work Remotely: Copywriting", plugin: "rss", url: "https://weworkremotely.com/categories/remote-copywriting-jobs.rss", fields: ["content"] },
  { name: "ProBlogger Jobs", plugin: "generic", url: "https://problogger.com/jobs/", fields: ["content"], note: "Writing and blogging roles." },
  { name: "Superpath Jobs", plugin: "generic", url: "https://jobs.superpath.co/", fields: ["content", "marketing"], note: "Content marketing and writing roles." },
  { name: "Behance Job List", plugin: "generic", url: "https://www.behance.net/joblist", fields: ["design", "video"], config: { render: true }, note: "May be bot-protected." },
  { name: "Mandy", plugin: "generic", url: "https://www.mandy.com/jobs", fields: ["video"], config: { render: true }, note: "Film and video crew jobs. May be bot-protected." },
  { name: "ProductionHUB", plugin: "generic", url: "https://www.productionhub.com/jobs", fields: ["video"], config: { render: true }, note: "Video production jobs. May be bot-protected." },

  // Product and marketing
  { name: "We Work Remotely: Product", plugin: "rss", url: "https://weworkremotely.com/categories/remote-product-jobs.rss", fields: ["product"] },
  { name: "We Work Remotely: Marketing", plugin: "rss", url: "https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss", fields: ["marketing"] },
  { name: "Remotive: Product", plugin: "generic", url: "https://remotive.com/remote-jobs/product", fields: ["product"] },
  { name: "Remotive: Marketing", plugin: "generic", url: "https://remotive.com/remote-jobs/marketing", fields: ["marketing"] },
  { name: "Growth.Talent", plugin: "generic", url: "https://www.growthtalent.org/", fields: ["marketing"], note: "Growth marketing roles." },
  { name: "NoDesk", plugin: "generic", url: "https://nodesk.co/remote-jobs/", fields: ["product", "marketing", "design"] },
  { name: "Working Nomads", plugin: "generic", url: "https://www.workingnomads.com/jobs", fields: ["product", "marketing", "content"] },
  { name: "Mind the Product Jobs", plugin: "generic", url: "https://careers.mindtheproduct.com/", fields: ["product"], note: "Product management roles." },
];

/** Guesses the plugin for a URL a user pastes in. */
export function detectPlugin(url: string): SourcePluginId {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "generic";
  }
  const host = u.hostname.toLowerCase();
  if (host.endsWith("greenhouse.io")) return "greenhouse";
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") return "lever";
  if (host === "jobs.ashbyhq.com") return "ashby";
  if (host === "news.ycombinator.com") return "hn_whoishiring";
  if (/\.(rss|xml)$/i.test(u.pathname) || /\/(feed|rss)\/?$/i.test(u.pathname)) return "rss";
  return "generic";
}

/** Never scraped, by policy. */
export const BLOCKED_HOSTS = ["linkedin.com", "naukri.com", "indeed.com", "indeed.co.in"];

export function isBlockedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));
  } catch {
    return false;
  }
}
