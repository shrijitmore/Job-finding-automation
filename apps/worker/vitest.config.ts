import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    name: "worker",
    include: ["src/**/*.test.ts"],
    testTimeout: 30000,
    fileParallelism: false,
    globalSetup: ["./vitest.global-setup.ts"],
  },
});
