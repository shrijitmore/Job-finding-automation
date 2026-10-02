# Job Autopilot

An open-source, autonomous job application platform. Upload a resume, pick the roles you want, and it runs on a schedule: it scrapes jobs, scores them against your resume, tailors a one-page resume and cover note for each one, validates them, applies, and handles simple recruiter replies.

It works for any profession: software, AI, Web3, product, design, video editing, content creation, AI content creation, marketing and leadership.

**Safe by default.** Every new profile starts in DRY_RUN: the full pipeline runs, but nothing is emailed or submitted. You review the would-be applications in the dashboard and turn live mode on per profile when you are ready.

---

## Contents

- [What it does](#what-it-does)
- [How a run works](#how-a-run-works)
- [Safety rules](#safety-rules)
- [Architecture](#architecture)
- [Quick start (local)](#quick-start-local)
- [Configuration](#configuration)
- [Gmail OAuth setup](#gmail-oauth-setup)
- [Telegram setup](#telegram-setup)
- [Object storage (Cloudflare R2)](#object-storage-cloudflare-r2)
- [Hosting](#hosting)
- [Sources](#sources)
- [Tests](#tests)
- [Project layout](#project-layout)

## What it does

- **Multiple candidate profiles** under one owner login. Each profile has its own resume, preferences, Gmail, schedule and history, so you can run it for friends too.
- **Onboarding**: upload a PDF or DOCX. Claude parses it into a structured master resume (contact, summary, experience, projects, education, skills, metrics, portfolio links). You fix anything in an editable form before saving. Portfolio links (GitHub, Behance, Dribbble, YouTube, Instagram, site) are first-class because they matter for creative roles.
- **Skills manager**: tag each skill as core (you use it) or extended (you can pick it up). Tailored resumes only ever use skills on this list; extended ones only appear on an "Also working with" line.
- **Job preferences**: searchable role picker grouped by field, custom roles, experience range, locations, remote/hybrid/onsite, job type, excluded companies and keywords, minimum fit score.
- **Sources manager**: toggle sources, see last run status and job counts, add any career page or board by URL. Sources are tagged by field so a video editor profile never pulls from Web3 boards.
- **Schedule and limits**: run times in your time zone (default 7:00 and 19:00), daily cap split across runs (default 15), per-company cooldown (default 30 days), DRY_RUN toggle, Run now.
- **Writing style rules** per profile: no em or en dashes, short direct sentences, no filler, no power-verb bullet openers, product-focused language, and an editable banned-phrase list. Enforced by the validator, not just the prompt.
- **Dashboard**: applied today and this week, response rate, interviews flagged, applications table with filters, and a detail view with the JD, fit score and reasons, tailored PDF preview and download, cover note, apply channel and screenshot proof.
- **Inbox**: recruiter replies grouped by what needs you, with an editable suggested draft and one-click send.
- **Run logs**: timings per step, counts, errors, blocked sources and Claude token cost per run.
- **Settings**: Gmail per profile, Telegram, Claude API key, and token usage per profile.

## How a run works

Each run is a [LangGraph.js](https://github.com/langchain-ai/langgraphjs) graph for one profile:

```
replies -> fetch -> filter -> score -> tailor + validate -> apply -> notify
```

1. **Replies**: read new Gmail replies on threads the agent started. Claude classifies each one (resume request, portfolio request, interview scheduling, salary question, assessment, rejection, other). It auto-replies only to resume and portfolio requests, using fixed templates. Interview, salary and assessment messages are flagged in the Inbox and on Telegram with a draft that never agrees to times, states salary numbers or accepts deadlines. Rejections are recorded.
2. **Fetch**: scrape every enabled source tagged with the profile's fields. Greenhouse, Lever and Ashby boards are read from the public JSON they serve. Other pages go through one generic extractor: the HTML is turned into clean text and Claude returns strict JSON listings. Each listing is followed to its detail page for the full JD. Pages are cached by content hash so unchanged listings are not re-extracted. Jobs are normalized into one schema and deduplicated by canonical URL and company + title.
3. **Filter**: hard filters from your preferences plus a posted-within-21-days rule, before any Claude call.
4. **Score**: Claude compares each JD with the master resume and returns a fit score, role type, matched and missing skills, red flags and the apply channel. Jobs above your threshold are kept, best first, up to this run's cap.
5. **Tailor**: Claude rewrites the summary for the role type and picks and rephrases the most relevant bullets and projects. Titles, companies, dates, education and years always come from the master resume. A template is chosen by field (technical, portfolio-first or impact-focused), a cover note under 120 words is written, and Puppeteer renders a one-page PDF.
6. **Validate**: deterministic checks first (dashes, banned phrases, power verbs, skill whitelist, facts, numbers that don't exist in the master resume, cover note length, portfolio link for creative roles, exactly one page), then a second Claude review. On failure it regenerates once with the issues as feedback; a second failure skips the job and logs why.
7. **Apply** by channel: email (Gmail API, cover note + PDF attached), Greenhouse/Lever/Ashby forms (Playwright: fill, upload, answer standard questions from the profile, screenshot after submit), or manual apply with a direct link for everything else. Random delays between applications.
8. **Notify**: a Telegram summary with applied, skipped with reasons, manual-apply links, blocked sources, failures and cost.

## Safety rules

These are enforced in code and covered by tests:

- DRY_RUN is on by default per profile. Turning it off asks for confirmation.
- LinkedIn, Naukri and Indeed are never scraped, and LinkedIn or Indeed Easy Apply is never automated.
- Scraping is headless, always logged out, respects robots.txt (including Crawl-delay) and waits 2 to 5 seconds between requests to a host. On a block, rate limit or CAPTCHA it backs off for 24 hours and logs it. No proxy rotation, no CAPTCHA solving.
- Forms with a CAPTCHA, or with a required question the profile can't answer truthfully (salary, visa or work authorization, start date, relocation, demographics, referral and similar), are not submitted. They show up as manual apply with the reasons.
- Idempotent runs: each application is claimed before any send or submit. A crashed and retried run never applies twice; an interrupted submit is marked for manual review instead of retried.
- One broken source never stops a run.
- OAuth tokens and API keys are encrypted at rest with AES-256-GCM.
- Claude token usage and cost are tracked per run and per profile.

## Architecture

```
apps/web      React + Vite + Tailwind. Responsive, dark mode.
apps/api      NestJS. Auth, profiles, onboarding, sources, applications, inbox, settings, Gmail OAuth.
apps/worker   NestJS standalone. pg-boss consumers and cron, LangGraph run graph.
packages/shared    Zod schemas, role catalog, source catalog, defaults, time helpers.
packages/db        Drizzle schema and SQL migrations.
packages/core      Claude client, encryption, object storage, Gmail, Telegram, queues, resume parsing.
packages/scraper   Polite fetcher, browser renderer, source plugins, normalization and dedupe.
packages/pipeline  Filters, scoring and tailoring prompts, templates, PDF rendering, validator, reply classifier.
packages/applier   Playwright form filling for Greenhouse, Lever and Ashby.
```

Postgres is the only stateful service. [pg-boss](https://github.com/timgit/pg-boss) provides queues and cron on the same database, so there is no Redis. PDFs and screenshots go to S3-compatible storage (Cloudflare R2) or local disk in development.

Claude calls use `claude-sonnet-5-5` with structured outputs (Zod schemas), prompt caching on the system prompts, and server-side refusal fallback.

## Quick start (local)

Requirements: Node 22, pnpm (via corepack), Postgres 14+, and Chromium (any Playwright-installed Chromium works).

```bash
git clone https://github.com/shrijitmore/Job-finding-automation.git
cd Job-finding-automation
corepack enable
pnpm install
cp .env.example .env            # set DATABASE_URL, ENCRYPTION_KEY, JWT_SECRET at minimum
npx playwright install chromium # if you don't already have Chromium
pnpm build
set -a; source .env; set +a
pnpm --filter @jfa/api start &     # http://localhost:4000, runs migrations on start
pnpm --filter @jfa/worker start &  # scrapes, scores, tailors, applies
pnpm --filter @jfa/web dev         # http://localhost:5173
```

Open the web app, create the owner account (or set `OWNER_EMAIL` and `OWNER_PASSWORD`), add your Claude API key in Settings, create a profile and upload a resume.

To try everything without a Claude key, start the API and worker with `LLM_FAKE=1`. A deterministic stand-in is used for every Claude call.

## Configuration

All settings are environment variables. See [`.env.example`](.env.example) for the full list with comments. The important ones:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | api, worker | Postgres (Neon or Supabase). Add `?sslmode=require` for hosted databases. |
| `ENCRYPTION_KEY` | api, worker | 32+ random characters. Encrypts tokens and keys. Same value on both services; never change it after saving secrets. |
| `JWT_SECRET` | api | Signs session cookies and OAuth state. |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | api | Seeds the owner account. Set `ALLOW_SETUP=false` in production. |
| `ANTHROPIC_API_KEY` | api, worker | Optional fallback; a key saved in Settings wins. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | api, worker | Gmail OAuth client. |
| `API_PUBLIC_URL` | api | Public base URL of the API, used for the Gmail redirect. |
| `WEB_ORIGIN` | api | Web origin(s) for CORS and OAuth redirects. |
| `WEB_PUBLIC_URL` | worker | Used for links in Telegram summaries. |
| `S3_*` | api, worker | Object storage. Empty means local disk. |
| `WEB_DIST_DIR` | api | If set, the API also serves the built web app (one service, simplest cookies). |
| `ATS_FORMS_ENABLED` | worker | `false` turns Greenhouse, Lever and Ashby jobs into manual apply. |
| `MAX_SCORE_PER_RUN` | worker | Upper bound on jobs scored per run (cost control). |

## Gmail OAuth setup

Each profile connects its own Gmail account. You create one Google OAuth client for your install.

1. Go to [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. **APIs & Services > Library**: enable the **Gmail API**.
3. **APIs & Services > OAuth consent screen**: choose **External**. Add the scope `https://www.googleapis.com/auth/gmail.modify` (plus `openid` and `email`). While the app is in **Testing** mode, add every Gmail address that will connect (you and your friends) under **Test users**. Testing mode refresh tokens expire after 7 days; publish the app or reconnect weekly.
4. **APIs & Services > Credentials > Create credentials > OAuth client ID**: type **Web application**. Add the authorized redirect URI:
   ```
   <API_PUBLIC_URL>/api/gmail/callback
   ```
   For local development that is `http://localhost:4000/api/gmail/callback`.
5. Put the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the API and the worker.
6. In the web app, open **Settings** for a profile and click **Connect Gmail**.

The app sends application emails and reads replies only on threads it started. `gmail.modify` is needed to read those threads and send in-thread replies; nothing is deleted.

## Telegram setup

1. In Telegram, talk to [@BotFather](https://t.me/BotFather), send `/newbot` and copy the bot token.
2. Send any message to your new bot.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy `message.chat.id` (for a group, add the bot to the group and use the negative group id).
4. In **Settings > Telegram**, paste the token and chat ID, save, and press **Send test message**.

You get a summary after every run and an alert when a reply needs you.

## Object storage (Cloudflare R2)

1. In Cloudflare, create an R2 bucket.
2. Create an R2 API token with read and write access to that bucket.
3. Set `S3_BUCKET`, `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` on the API and the worker.

Any S3-compatible store works (AWS S3, MinIO). Without these variables, files go to `LOCAL_STORAGE_DIR`, which only works when the API and worker share a disk.

## Hosting

You need three things: a Postgres database, the API (which can also serve the web app), and the worker.

**Database**: create a free Postgres on [Neon](https://neon.tech) or [Supabase](https://supabase.com) and use its connection string as `DATABASE_URL`. Migrations run automatically when the API starts.

### Render (recommended, one click)

The repo includes a [`render.yaml`](render.yaml) Blueprint that creates:

- `jfa-api`: a Docker web service built from [`deploy/api.Dockerfile`](deploy/api.Dockerfile). It serves the API and the web app on the same origin.
- `jfa-worker`: a background worker built from [`deploy/worker.Dockerfile`](deploy/worker.Dockerfile), on the Playwright image so Chromium is available for scraping, PDFs and forms.

Steps: in Render, **New > Blueprint**, pick this repo, fill in the environment variables, deploy. Then set `API_PUBLIC_URL`, `WEB_ORIGIN` and `WEB_PUBLIC_URL` to the API's URL (for example `https://jfa-api.onrender.com`) and add `https://jfa-api.onrender.com/api/gmail/callback` to your Google OAuth client.

The worker needs about 1 GB of memory for Chromium. Render's free tier does not offer background workers.

### Railway

Create two services from this repo and point each at its config file under [`deploy/railway`](deploy/railway): `api.railway.json` and `worker.railway.json`. Set the same environment variables as above. Add a Railway Postgres or use Neon/Supabase.

### Vercel for the web app (optional)

If you prefer to host the web app separately, import `apps/web` into Vercel ([`apps/web/vercel.json`](apps/web/vercel.json) is included) and set `VITE_API_URL` to the API URL. On the API set `WEB_ORIGIN` to the Vercel URL. The session cookie is then cross-site, so the API must be on HTTPS (cookies are sent with `SameSite=None; Secure` in production). Serving the web app from the API avoids this.

## Sources

Sources are plugins (`packages/scraper/src/plugins`): `greenhouse`, `lever`, `ashby`, `rss`, `hn_whoishiring` and `generic`. Add or disable sources in the UI without code changes. Pasting a URL auto-detects the plugin, and a company career page that embeds a Greenhouse, Lever or Ashby board is read through that board's JSON.

Seeded for every account (all editable):

- **Engineering and AI**: company boards (Anthropic, Vercel, Stripe, Databricks, Figma, Razorpay, Coinbase, Palantir, CRED, Zeta, OpenAI, Linear, Ramp, Notion, Cursor, ElevenLabs), Wellfound, Cutshort, Instahyre, YC Work at a Startup, RemoteOK, We Work Remotely, HN Who is Hiring.
- **Web3**: web3.career, Crypto Jobs List, CryptocurrencyJobs.

**Proposed, not added until you confirm** (Sources page, "Suggested boards"):

- **Design, video and content**: Dribbble Jobs, Authentic Jobs, YT Jobs, Remotive Design and Writing, We Work Remotely Design and Copywriting, ProBlogger Jobs, Superpath, Behance Job List, Mandy, ProductionHUB.
- **Product and marketing**: We Work Remotely Product and Marketing, Remotive Product and Marketing, Growth.Talent, NoDesk, Working Nomads, Mind the Product Jobs.

Some sites (for example Wellfound, Instahyre, Behance) use bot protection. The scraper does not try to get around it: the source shows as blocked, backs off and the run continues.

## Tests

```bash
pnpm test        # unit and integration tests (needs Postgres; databases jfa_test and jfa_test_worker)
pnpm test:e2e    # Playwright end-to-end tests: onboarding, sources, dashboard dry run, inbox, run logs
```

Highlights: saved HTML/JSON fixtures for every scraper plugin, fixture JDs from nine professions for the scoring and tailoring prompts, validator and filter unit tests, real PDF rendering, form filling against local Greenhouse, Lever and Ashby fixtures, a full pipeline run in dry run and live mode with a fake mailer, crash-retry idempotency, and an e2e dry run from Run now to the application detail page.

`pnpm --filter @jfa/pipeline eval:live` runs the real prompts against the fixture JDs with your `ANTHROPIC_API_KEY` (costs a few cents; never runs in CI).

## Project layout

See [Architecture](#architecture). The phase-by-phase build history is in [`docs/ROADMAP.md`](docs/ROADMAP.md), and contribution rules are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE)
