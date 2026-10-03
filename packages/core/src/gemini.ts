import { GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";
import { LlmError, type LlmClient, type LlmRequest, type LlmUsage } from "./llm";
import { decodeCredentials } from "./storage";

export const DEFAULT_VERTEX_MODEL = "gemini-2.5-flash-lite";

/** USD per million tokens, list prices for Vertex AI. Unknown models fall back by family. */
const GEMINI_PRICING: Array<[RegExp, { input: number; output: number }]> = [
  [/flash-lite/, { input: 0.1, output: 0.4 }],
  [/flash/, { input: 0.3, output: 2.5 }],
  [/pro/, { input: 1.25, output: 10 }],
];

export function geminiCostUsd(model: string, input: number, output: number): number {
  const p = GEMINI_PRICING.find(([re]) => re.test(model))?.[1] ?? GEMINI_PRICING[0][1];
  return (input * p.input + output * p.output) / 1_000_000;
}

/** Zod schema to the JSON Schema subset Gemini accepts. */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export interface GeminiOptions {
  /** Gemini Developer API key (AI Studio). When set, Vertex settings are ignored. */
  apiKey?: string;
  /** Service account key JSON (raw or base64). Omit to use Application Default Credentials on GCP. */
  credentialsJson?: string;
  project?: string;
  /** "global" routes to any region with capacity. */
  location?: string;
  model?: string;
  onUsage?: (usage: LlmUsage) => void | Promise<void>;
}

/**
 * Gemini, through the Gemini API with an API key or through Vertex AI (Agent Platform)
 * with a service account. Same contract as the Claude client: JSON constrained by the
 * request's Zod schema, validated again on return, with usage reported per call.
 */
export class GeminiLlm implements LlmClient {
  private readonly ai: GoogleGenAI;
  readonly model: string;

  constructor(private readonly opts: GeminiOptions) {
    this.model = opts.model ?? DEFAULT_VERTEX_MODEL;
    if (opts.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: opts.apiKey });
      return;
    }
    const credentials = opts.credentialsJson ? (JSON.parse(decodeCredentials(opts.credentialsJson)) as { project_id?: string }) : undefined;
    const project = opts.project ?? credentials?.project_id;
    if (!project) throw new LlmError("Vertex AI needs a project id (VERTEX_PROJECT or a service account key)", false);
    this.ai = new GoogleGenAI({
      vertexai: true,
      project,
      location: opts.location ?? "global",
      googleAuthOptions: credentials ? { credentials: credentials as never } : undefined,
    });
  }

  async generate<S extends z.ZodType>(req: LlmRequest<S>): Promise<{ data: z.infer<S>; usage: LlmUsage }> {
    // Retries rate limits, server errors and malformed JSON with backoff.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.once(req);
      } catch (err) {
        if (!(err instanceof LlmError) || !err.retryable || attempt >= 3) throw err;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  }

  private async once<S extends z.ZodType>(req: LlmRequest<S>): Promise<{ data: z.infer<S>; usage: LlmUsage }> {
    const parts: Part[] = req.content.map((c) =>
      c.type === "pdf" ? { inlineData: { mimeType: "application/pdf", data: c.base64 } } : { text: c.text },
    );
    let response;
    try {
      response = await this.ai.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: req.system,
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiSchema(req.schema),
          maxOutputTokens: req.maxTokens ?? 16000,
          temperature: 0.2,
        },
      });
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      const status = Number((err as { status?: number }).status ?? msg.match(/"code":\s*(\d{3})/)?.[1] ?? 0);
      if (status === 429 || status >= 500) throw new LlmError(`Gemini temporarily unavailable: ${msg.slice(0, 200)}`, true);
      if (status === 401 || status === 403) throw new LlmError(
          this.opts.apiKey
            ? `Gemini API key rejected. Use a key from AI Studio, or allow "Generative Language API" in the key's API restrictions. ${msg.slice(0, 160)}`
            : `Agent Platform (Vertex AI) permission denied. Grant the service account "Agent Platform User" (roles/aiplatform.user). ${msg.slice(0, 160)}`,
          false,
        );
      throw new LlmError(`Gemini request failed: ${msg.slice(0, 300)}`, false);
    }

    const meta = response.usageMetadata;
    const usage: LlmUsage = {
      purpose: req.purpose,
      model: response.modelVersion ?? this.model,
      inputTokens: (meta?.promptTokenCount ?? 0) - (meta?.cachedContentTokenCount ?? 0),
      outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
      cacheReadTokens: meta?.cachedContentTokenCount ?? 0,
      costUsd: 0,
    };
    usage.costUsd = geminiCostUsd(this.model, usage.inputTokens + usage.cacheReadTokens * 0.25, usage.outputTokens);
    await this.opts.onUsage?.(usage);

    const finish = response.candidates?.[0]?.finishReason;
    if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") throw new LlmError("The model declined this request", false);
    if (finish === "MAX_TOKENS") throw new LlmError("Model response was cut off", true);
    const text = response.text ?? "";
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LlmError("Model returned invalid JSON", true);
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) throw new LlmError(`Model output did not match the schema: ${parsed.error.issues[0]?.message ?? ""}`, true);
    return { data: parsed.data, usage };
  }
}
