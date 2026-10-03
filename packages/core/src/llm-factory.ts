import { ClaudeLlm, type LlmClient, type LlmUsage } from "./llm";
import { DEFAULT_VERTEX_MODEL, VertexGeminiLlm } from "./gemini";

export type LlmProvider = "anthropic" | "vertex";

export interface LlmEnv {
  LLM_PROVIDER?: string;
  CLAUDE_MODEL?: string;
  VERTEX_MODEL?: string;
  VERTEX_LOCATION?: string;
  VERTEX_PROJECT?: string;
  VERTEX_CREDENTIALS_JSON?: string;
  GCS_CREDENTIALS_JSON?: string;
}

export function llmProvider(env: LlmEnv): LlmProvider {
  return env.LLM_PROVIDER === "vertex" ? "vertex" : "anthropic";
}

/** Human-readable description of the configured model, for the Settings page. */
export function llmDescription(env: LlmEnv): { provider: LlmProvider; model: string } {
  return llmProvider(env) === "vertex"
    ? { provider: "vertex", model: env.VERTEX_MODEL || DEFAULT_VERTEX_MODEL }
    : { provider: "anthropic", model: env.CLAUDE_MODEL || "claude-sonnet-5-5" };
}

/**
 * Builds the configured LLM client. Vertex uses the service account key (VERTEX_CREDENTIALS_JSON,
 * falling back to the storage key) or Application Default Credentials on GCP. Anthropic needs a key.
 */
export function createLlm(env: LlmEnv, opts: { anthropicKey?: string | null; onUsage?: (u: LlmUsage) => void | Promise<void> }): LlmClient | null {
  if (llmProvider(env) === "vertex") {
    return new VertexGeminiLlm({
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
