import { Global, Inject, Injectable, Logger, Module, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { createBoss, ensureQueues, type PgBoss } from "@jfa/core";
import { CONFIG, type AppConfig } from "../config";

export const BOSS = Symbol("BOSS");

@Injectable()
class BossLifecycle implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger("Queue");

  constructor(@Inject(BOSS) private readonly boss: PgBoss) {}

  async onModuleInit(): Promise<void> {
    this.boss.on("error", (err) => this.logger.error(err));
    await this.boss.start();
    await ensureQueues(this.boss);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop({ graceful: false }).catch(() => undefined);
  }
}

/** pg-boss client for sending jobs. The worker owns cron schedules and maintenance. */
@Global()
@Module({
  providers: [
    {
      provide: BOSS,
      inject: [CONFIG],
      useFactory: (config: AppConfig) => createBoss(config.DATABASE_URL, { schedule: false, supervise: false }),
    },
    BossLifecycle,
  ],
  exports: [BOSS],
})
export class QueueModule {}
