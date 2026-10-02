import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "scraper", include: ["src/**/*.test.ts"], testTimeout: 30000 },
});
