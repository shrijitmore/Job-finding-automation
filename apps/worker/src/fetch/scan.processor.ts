import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { QUEUES, type PgBoss, type SourceScanJob } from "@jfa/core";
import { eq, sources, type Db } from "@jfa/db";
import type { KeepAwake } from "../keep-awake";
import { BOSS, DB, KEEP_AWAKE } from "../infra.module";
import { LlmFactory } from "../llm/llm.factory";
import { FetchService } from "./fetch.service";

/** Handles "Scan now" from the Sources page: scrapes one source and stores its jobs. */
@Injectable()
export class ScanProcessor implements OnModuleInit {
  private readonly logger = new Logger(ScanProcessor.name);

  constructor(
    @Inject(BOSS) private readonly boss: PgBoss,
    @Inject(DB) private readonly db: Db,
    private readonly fetch: FetchService,
    private readonly llm: LlmFactory,
    @Inject(KEEP_AWAKE) private readonly keepAwake: KeepAwake,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.boss.work<SourceScanJob>(QUEUES.sourceScan, { localConcurrency: 2 }, async (batch) => {
      await this.keepAwake.during(async () => {
        for (const job of batch) await this.scan(job.data.sourceId);
      });
    });
  }

  async scan(sourceId: string) {
    const [source] = await this.db.select().from(sources).where(eq(sources.id, sourceId));
    if (!source) return null;
    const llm = await this.llm.create({ userId: source.userId });
    // A manual scan clears any back-off so the user can retry a blocked source.
    const report = await this.fetch.fetchSources([{ ...source, blockedUntil: null }], llm);
    this.logger.log(`Scan of ${source.name} finished: ${JSON.stringify(report.sources[0])}`);
    return report;
  }
}
