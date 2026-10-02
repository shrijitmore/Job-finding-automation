# API + built web app served from the same origin.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "./packages/**" build && pnpm --filter @jfa/api build && pnpm --filter @jfa/web build
RUN pnpm --filter @jfa/api deploy --prod /out && cp -r apps/web/dist /out/web

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4000 WEB_DIST_DIR=/app/web PUPPETEER_SKIP_DOWNLOAD=1
WORKDIR /app
COPY --from=build /out /app
EXPOSE 4000
CMD ["node", "dist/main.js"]
