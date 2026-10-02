import { Inject, Injectable } from "@nestjs/common";
import { ClaudeLlm, FakeLlm, decryptJson, defaultFakeHandlers, type LlmClient, type LlmUsage } from "@jfa/core";
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

  /** Returns a client that records every call's tokens and cost against the run and profile, or null if no key. */
  async create(scope: UsageScope): Promise<LlmClient | null> {
    const onUsage = (u: LlmUsage) => this.record(scope, u);
    if (this.config.LLM_FAKE === "1") return new FakeLlm(defaultFakeHandlers(), onUsage);
    const key = await this.apiKey(scope.userId);
    if (!key) return null;
    return new ClaudeLlm({ apiKey: key, model: this.config.CLAUDE_MODEL, onUsage });
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
