import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(16),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default("claude-sonnet-5-5"),
  LLM_PROVIDER: z.enum(["anthropic", "vertex"]).default("anthropic"),
  VERTEX_MODEL: z.string().optional(),
  VERTEX_LOCATION: z.string().optional(),
  VERTEX_PROJECT: z.string().optional(),
  VERTEX_CREDENTIALS_JSON: z.string().optional(),
  GCS_CREDENTIALS_JSON: z.string().optional(),
  WEB_PUBLIC_URL: z.string().default("http://localhost:5173"),
  CHROMIUM_PATH: z.string().optional(),
  SCRAPE_MIN_DELAY_MS: z.coerce.number().default(2000),
  SCRAPE_MAX_DELAY_MS: z.coerce.number().default(5000),
  WORKER_CONCURRENCY: z.coerce.number().default(1),
  LLM_FAKE: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  /** Fill Greenhouse, Lever and Ashby forms. When off, those jobs become manual apply. */
  ATS_FORMS_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  /** Max jobs scored per run, newest first. Bounds Claude cost. */
  MAX_SCORE_PER_RUN: z.coerce.number().default(40),
  /** Random delay range between applications. */
  APPLY_MIN_DELAY_MS: z.coerce.number().default(20_000),
  APPLY_MAX_DELAY_MS: z.coerce.number().default(90_000),
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
