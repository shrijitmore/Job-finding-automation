import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(16),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default("claude-sonnet-5-5"),
  WEB_PUBLIC_URL: z.string().default("http://localhost:5173"),
  CHROMIUM_PATH: z.string().optional(),
  SCRAPE_MIN_DELAY_MS: z.coerce.number().default(2000),
  SCRAPE_MAX_DELAY_MS: z.coerce.number().default(5000),
  WORKER_CONCURRENCY: z.coerce.number().default(1),
  LLM_FAKE: z.string().optional(),
});

export type WorkerConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  return parsed.data;
}

export const CONFIG = Symbol("CONFIG");
