import { Inject, Injectable } from "@nestjs/common";
import { FakeLlm, createLlm, decryptJson, llmProvider, type LlmClient, type LlmUsage } from "@jfa/core";
import { pipelineFakeHandlers } from "@jfa/pipeline";
import { and, credentials, eq, isNull, runs, sql, tokenUsage, type Db } from "@jfa/db";
import { CONFIG, type WorkerConfig } from "../config";
import { DB } from "../infra.module";

export interface UsageScope {
  userId: string;
  profileId?: string | null;
  runId?: string | null;
}

@Injectable()
export class LlmFactory {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: WorkerConfig,
  ) {}

  async apiKey(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select()
      .from(credentials)
      .where(and(eq(credentials.userId, userId), eq(credentials.kind, "anthropic"), isNull(credentials.profileId)));
    if (row) return decryptJson<{ apiKey: string }>(row.ciphertext, this.config.ENCRYPTION_KEY).apiKey;
    return this.config.ANTHROPIC_API_KEY ?? null;
  }

  /** Returns the configured client (Claude or Gemini on Vertex), recording tokens and cost per run and profile. Null if Claude has no key. */
  async create(scope: UsageScope): Promise<LlmClient | null> {
    const onUsage = (u: LlmUsage) => this.record(scope, u);
    if (this.config.LLM_FAKE === "1") return new FakeLlm(pipelineFakeHandlers(), onUsage);
    const key = llmProvider(this.config) === "anthropic" ? await this.apiKey(scope.userId) : null;
    return createLlm(this.config, { anthropicKey: key, onUsage });
  }

  private async record(scope: UsageScope, u: LlmUsage): Promise<void> {
    await this.db.insert(tokenUsage).values({
      profileId: scope.profileId ?? null,
      runId: scope.runId ?? null,
      purpose: u.purpose,
      model: u.model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cacheReadTokens: u.cacheReadTokens,
      costUsd: u.costUsd.toFixed(6),
    });
    if (scope.runId) {
      await this.db
        .update(runs)
        .set({
          inputTokens: sql`${runs.inputTokens} + ${u.inputTokens + u.cacheReadTokens}`,
          outputTokens: sql`${runs.outputTokens} + ${u.outputTokens}`,
          costUsd: sql`${runs.costUsd} + ${u.costUsd.toFixed(6)}::numeric`,
        })
        .where(eq(runs.id, scope.runId));
    }
  }
}
