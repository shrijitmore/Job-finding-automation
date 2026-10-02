# Worker: scraping, PDF rendering and form filling need Chromium, which this image ships.
FROM mcr.microsoft.com/playwright:v1.56.1-noble AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "./packages/**" build && pnpm --filter @jfa/worker build
RUN pnpm --filter @jfa/worker deploy --prod /out

FROM mcr.microsoft.com/playwright:v1.56.1-noble
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build /out /app
CMD ["node", "dist/main.js"]
