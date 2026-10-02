import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

/** USD per million tokens. */
const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};

export function estimateCostUsd(model: string, input: number, output: number, cacheRead = 0): number {
  const p = PRICING[model] ?? PRICING[DEFAULT_MODEL];
  return (input * p.input + output * p.output + cacheRead * p.cacheRead) / 1_000_000;
}

export interface LlmUsage {
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export type LlmContent =
  | { type: "text"; text: string }
  | { type: "pdf"; base64: string };

export interface LlmRequest<S extends z.ZodType> {
  /** Short label used for usage tracking, e.g. "score" or "tailor". */
  purpose: string;
  schema: S;
  /** Stable instructions. Cached across calls. */
  system: string;
  content: LlmContent[];
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

export interface LlmClient {
  generate<S extends z.ZodType>(req: LlmRequest<S>): Promise<{ data: z.infer<S>; usage: LlmUsage }>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface ClaudeOptions {
  apiKey: string;
  model?: string;
  /** Called after every successful call so usage can be stored per run and profile. */
  onUsage?: (usage: LlmUsage) => void | Promise<void>;
}

/** Claude client that returns schema-validated JSON through structured outputs. */
export class ClaudeLlm implements LlmClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(private readonly opts: ClaudeOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 3 });
    this.model = opts.model ?? DEFAULT_MODEL;
  }

  async generate<S extends z.ZodType>(req: LlmRequest<S>): Promise<{ data: z.infer<S>; usage: LlmUsage }> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = req.content.map((c) =>
      c.type === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: c.base64 } }
        : { type: "text", text: c.text },
    );
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: req.maxTokens ?? 16000,
        // Server-side fallback reroutes a safety decline instead of failing the call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
        output_config: { format: betaZodOutputFormat(req.schema), effort: req.effort ?? "medium" },
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
        throw new LlmError(`Claude temporarily unavailable: ${err.message}`, true);
      }
      if (err instanceof Anthropic.AuthenticationError) {
        throw new LlmError("Claude API key is invalid", false);
      }
      if (err instanceof Anthropic.APIError) {
        throw new LlmError(`Claude request failed: ${err.message}`, false);
      }
      throw err;
    }

    const usage: LlmUsage = {
      purpose: req.purpose,
      model: response.model ?? this.model,
      inputTokens: (response.usage.input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
      outputTokens: response.usage.output_tokens ?? 0,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      costUsd: 0,
    };
    usage.costUsd = estimateCostUsd(usage.model, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens);
    await this.opts.onUsage?.(usage);

    if (response.stop_reason === "refusal") throw new LlmError("Claude declined this request", false);
    if (response.stop_reason === "max_tokens") throw new LlmError("Claude response was cut off", true);
    if (response.parsed_output == null) throw new LlmError("Claude returned output that did not match the schema", true);
    return { data: response.parsed_output as z.infer<S>, usage };
  }
}
