import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ClaudeLlm, FakeLlm, defaultFakeHandlers, type LlmClient, type LlmUsage } from "@jfa/core";
import { tokenUsage, type Db } from "@jfa/db";
import { CONFIG, type AppConfig } from "../config";
import { DB } from "../db/db.module";
import { CredentialsService } from "../settings/credentials.service";

@Injectable()
export class LlmService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly credentials: CredentialsService,
  ) {}

  /** Returns a Claude client that records token usage against the profile. */
  async forProfile(userId: string, profileId: string): Promise<LlmClient> {
    const onUsage = async (u: LlmUsage) => {
      await this.db.insert(tokenUsage).values({
        profileId,
        purpose: u.purpose,
        model: u.model,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        cacheReadTokens: u.cacheReadTokens,
        costUsd: u.costUsd.toFixed(6),
      });
    };
    if (this.config.LLM_FAKE === "1") return new FakeLlm(defaultFakeHandlers(), onUsage);
    const key = await this.credentials.anthropicKey(userId);
    if (!key) throw new BadRequestException("Add a Claude API key in Settings first");
    return new ClaudeLlm({ apiKey: key.key, model: this.config.CLAUDE_MODEL, onUsage });
  }
}
