# Contributing

Thanks for helping out. This project automates job applications, so changes must keep it honest and safe.

## Ground rules

- Never add scraping for LinkedIn, Naukri or Indeed, and never automate LinkedIn or Indeed Easy Apply.
- No CAPTCHA solving and no proxy rotation. Back off and log when a site blocks us.
- Respect robots.txt and keep the random delay between requests.
- The tailoring and validation steps must never invent titles, dates, employers, metrics or skills.
- DRY_RUN stays on by default for new profiles.

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env   # fill in DATABASE_URL, ENCRYPTION_KEY, JWT_SECRET
pnpm build
pnpm test
```

## Tests

- `pnpm test` runs unit and integration tests (needs Postgres; see `TEST_DATABASE_URL`).
- `pnpm test:e2e` runs Playwright end-to-end tests for the web app.

Open a pull request against `main`. CI must be green.
