import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "pipeline", include: ["src/**/*.test.ts"], testTimeout: 60000 },
});
