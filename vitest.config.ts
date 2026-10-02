import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one Postgres database, so files run one at a time.
    fileParallelism: false,
    projects: ["packages/*", "apps/api", "apps/worker"],
  },
});
