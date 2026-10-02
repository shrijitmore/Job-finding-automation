import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "applier", include: ["src/**/*.test.ts"], testTimeout: 60000 },
});
