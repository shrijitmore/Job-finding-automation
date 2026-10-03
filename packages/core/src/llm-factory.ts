import { ClaudeLlm, LlmError, type LlmClient, type LlmUsage } from "./llm";
import { DEFAULT_VERTEX_MODEL, GeminiLlm } from "./gemini";

export type LlmProvider = "anthropic" | "gemini" | "vertex";

export interface LlmEnv {
  LLM_PROVIDER?: string;
  CLAUDE_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  VERTEX_MODEL?: string;
  VERTEX_LOCATION?: string;
  VERTEX_PROJECT?: string;
  VERTEX_CREDENTIALS_JSON?: string;
  GCS_CREDENTIALS_JSON?: string;
}

export function llmProvider(env: LlmEnv): LlmProvider {
  return env.LLM_PROVIDER === "vertex" || env.LLM_PROVIDER === "gemini" ? env.LLM_PROVIDER : "anthropic";
}

/** Human-readable description of the configured model, for the Settings page. */
export function llmDescription(env: LlmEnv): { provider: LlmProvider; model: string } {
  const provider = llmProvider(env);
  if (provider === "gemini") return { provider, model: env.GEMINI_MODEL || DEFAULT_VERTEX_MODEL };
  if (provider === "vertex") return { provider, model: env.VERTEX_MODEL || DEFAULT_VERTEX_MODEL };
  return { provider, model: env.CLAUDE_MODEL || "claude-sonnet-5-5" };
}

/**
 * Builds the configured LLM client. Gemini uses GEMINI_API_KEY. Vertex uses the service account key (VERTEX_CREDENTIALS_JSON,
 * falling back to the storage key) or Application Default Credentials on GCP. Anthropic needs a key.
 */
export function createLlm(env: LlmEnv, opts: { anthropicKey?: string | null; onUsage?: (u: LlmUsage) => void | Promise<void> }): LlmClient | null {
  if (llmProvider(env) === "gemini") {
    if (!env.GEMINI_API_KEY) throw new LlmError("LLM_PROVIDER=gemini needs GEMINI_API_KEY", false);
    return new GeminiLlm({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || DEFAULT_VERTEX_MODEL, onUsage: opts.onUsage });
  }
  if (llmProvider(env) === "vertex") {
    return new GeminiLlm({
      credentialsJson: env.VERTEX_CREDENTIALS_JSON || env.GCS_CREDENTIALS_JSON || undefined,
      project: env.VERTEX_PROJECT || undefined,
      location: env.VERTEX_LOCATION || "global",
      model: env.VERTEX_MODEL || DEFAULT_VERTEX_MODEL,
      onUsage: opts.onUsage,
    });
  }
  if (!opts.anthropicKey) return null;
  return new ClaudeLlm({ apiKey: opts.anthropicKey, model: env.CLAUDE_MODEL, onUsage: opts.onUsage });
}
