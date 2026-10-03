import { describe, expect, it } from "vitest";
import { MasterResumeSchema, ReplyClassificationSchema, ScoreResultSchema, ScrapedJobSchema, TailoredResumeSchema } from "@jfa/shared";
import { z } from "zod";
import { DEFAULT_VERTEX_MODEL, GeminiLlm, geminiCostUsd, toGeminiSchema } from "./gemini";
import { ClaudeLlm } from "./llm";
import { createLlm, llmDescription, llmProvider } from "./llm-factory";

const KEY = JSON.stringify({ project_id: "proj", client_email: "x@proj.iam.gserviceaccount.com", private_key: "k" });

describe("toGeminiSchema", () => {
  it("converts every schema the app sends to the model", () => {
    for (const schema of [MasterResumeSchema, ScoreResultSchema, TailoredResumeSchema, ReplyClassificationSchema, z.object({ jobs: z.array(ScrapedJobSchema) })]) {
      const json = toGeminiSchema(schema);
      expect(json.$schema).toBeUndefined();
      expect(json.type).toBe("object");
      expect(() => JSON.stringify(json)).not.toThrow();
    }
  });
});

describe("geminiCostUsd", () => {
  it("prices Flash-Lite per million tokens", () => {
    expect(geminiCostUsd("gemini-2.5-flash-lite", 1_000_000, 1_000_000)).toBeCloseTo(0.5);
    expect(geminiCostUsd("gemini-3.1-flash-lite", 1_000_000, 1_000_000)).toBeCloseTo(1.75);
    expect(geminiCostUsd("gemini-2.5-flash", 1_000_000, 0)).toBeCloseTo(0.3);
  });
});

describe("createLlm", () => {
  it("defaults to Anthropic and needs a key", () => {
    expect(llmProvider({})).toBe("anthropic");
    expect(createLlm({}, {})).toBeNull();
    expect(createLlm({}, { anthropicKey: "sk-ant-x" })).toBeInstanceOf(ClaudeLlm);
  });

  it("uses Vertex with the service account key, no Claude key needed", () => {
    const llm = createLlm({ LLM_PROVIDER: "vertex", GCS_CREDENTIALS_JSON: Buffer.from(KEY).toString("base64") }, {});
    expect(llm).toBeInstanceOf(GeminiLlm);
    expect((llm as GeminiLlm).model).toBe(DEFAULT_VERTEX_MODEL);
    expect(llmDescription({ LLM_PROVIDER: "vertex", VERTEX_MODEL: "gemini-x" })).toEqual({ provider: "vertex", model: "gemini-x" });
  });

  it("uses the Gemini API with an API key", () => {
    const llm = createLlm({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: "AQ.test" }, {});
    expect(llm).toBeInstanceOf(GeminiLlm);
    expect(llmDescription({ LLM_PROVIDER: "gemini" })).toEqual({ provider: "gemini", model: DEFAULT_VERTEX_MODEL });
    expect(() => createLlm({ LLM_PROVIDER: "gemini" }, {})).toThrow(/GEMINI_API_KEY/);
  });

  it("explains a missing project", () => {
    expect(() => createLlm({ LLM_PROVIDER: "vertex" }, {})).toThrow(/project id/);
  });
});
