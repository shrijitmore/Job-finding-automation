import type { z } from "zod";
import { type LlmClient, type LlmRequest, type LlmUsage, LlmError } from "./llm";

export type FakeHandler = (req: LlmRequest<z.ZodType>) => unknown;

/**
 * Deterministic stand-in for Claude used by tests, e2e runs and LLM_FAKE=1.
 * Each purpose maps to a handler that returns data matching the request schema.
 */
export class FakeLlm implements LlmClient {
  readonly calls: Array<{ purpose: string; text: string }> = [];

  constructor(
    private readonly handlers: Record<string, FakeHandler>,
    private readonly onUsage?: (u: LlmUsage) => void | Promise<void>,
  ) {}

  async generate<S extends z.ZodType>(req: LlmRequest<S>): Promise<{ data: z.infer<S>; usage: LlmUsage }> {
    const text = req.content.map((c) => (c.type === "text" ? c.text : "[pdf]")).join("\n");
    this.calls.push({ purpose: req.purpose, text });
    const handler = this.handlers[req.purpose];
    if (!handler) throw new LlmError(`FakeLlm has no handler for "${req.purpose}"`, false);
    const parsed = req.schema.safeParse(handler(req as LlmRequest<z.ZodType>));
    if (!parsed.success) throw new LlmError(`FakeLlm output for "${req.purpose}" failed validation: ${parsed.error.message}`, false);
    const usage: LlmUsage = {
      purpose: req.purpose,
      model: "fake",
      inputTokens: Math.ceil((req.system.length + text.length) / 4),
      outputTokens: Math.ceil(JSON.stringify(parsed.data).length / 4),
      cacheReadTokens: 0,
      costUsd: 0,
    };
    await this.onUsage?.(usage);
    return { data: parsed.data, usage };
  }
}
