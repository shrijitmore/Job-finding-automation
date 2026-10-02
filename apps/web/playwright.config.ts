import { defineConfig, devices } from "@playwright/test";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/jfa_e2e";
const API_PORT = 4555;
const WEB_PORT = 4556;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node e2e/reset-db.mjs && node ../api/dist/main.js",
      port: API_PORT,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DB,
        JWT_SECRET: "e2e-jwt-secret-1234567890",
        ENCRYPTION_KEY: "e2e-encryption-key-1234567890",
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
        LOCAL_STORAGE_DIR: "/tmp/jfa-e2e-storage",
        LLM_FAKE: "1",
        AUTH_RATE_LIMIT: "1000",
      },
    },
    {
      // Started after the API so migrations don't race.
      command: "node -e \"setTimeout(()=>{},4000)\" && node ../worker/dist/main.js",
      port: 4558,
      reuseExistingServer: false,
      env: {
        HEALTH_PORT: "4558",
        DATABASE_URL: E2E_DB,
        ENCRYPTION_KEY: "e2e-encryption-key-1234567890",
        LOCAL_STORAGE_DIR: "/tmp/jfa-e2e-storage",
        LLM_FAKE: "1",
        MIGRATE_ON_START: "false",
        SCRAPE_MIN_DELAY_MS: "0",
        SCRAPE_MAX_DELAY_MS: "0",
        APPLY_MIN_DELAY_MS: "0",
        APPLY_MAX_DELAY_MS: "0",
      },
    },
    {
      command: "node e2e/fixture-server.mjs",
      port: 4557,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: false,
      env: { VITE_API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
});
