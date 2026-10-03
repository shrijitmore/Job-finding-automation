import { type DynamicModule, Global, Inject, Logger, Module, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { createBoss, createStorageFromEnv, ensureQueues, type ObjectStorage, type PgBoss } from "@jfa/core";
import { createDb, type Db, type DbHandle } from "@jfa/db";
import { CONFIG, type WorkerConfig } from "./config";
import { KeepAwake } from "./keep-awake";

export const DB = Symbol("DB");
export const DB_HANDLE = Symbol("DB_HANDLE");
export const BOSS = Symbol("BOSS");
export const STORAGE = Symbol("STORAGE");
export const KEEP_AWAKE = Symbol("KEEP_AWAKE");

/** KEEP_AWAKE_URL, or the public URL Render gives every web service. */
export function keepAwakeUrl(config: Pick<WorkerConfig, "KEEP_AWAKE_URL" | "RENDER_EXTERNAL_URL">): string | undefined {
  if (config.KEEP_AWAKE_URL) return config.KEEP_AWAKE_URL;
  return config.RENDER_EXTERNAL_URL ? `${config.RENDER_EXTERNAL_URL.replace(/\/$/, "")}/health` : undefined;
}

@Global()
@Module({})
export class InfraModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(InfraModule.name);

  constructor(
    @Inject(DB_HANDLE) private readonly handle: DbHandle,
    @Inject(BOSS) private readonly boss: PgBoss,
  ) {}

  static forRoot(config: WorkerConfig): DynamicModule {
    return {
      module: InfraModule,
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: DB_HANDLE, useFactory: () => createDb(config.DATABASE_URL) },
        { provide: DB, inject: [DB_HANDLE], useFactory: (h: DbHandle): Db => h.db },
        { provide: BOSS, useFactory: () => createBoss(config.DATABASE_URL) },
        { provide: STORAGE, useFactory: (): ObjectStorage => createStorageFromEnv() },
        { provide: KEEP_AWAKE, useFactory: () => new KeepAwake(keepAwakeUrl(config)) },
      ],
      exports: [CONFIG, DB, DB_HANDLE, BOSS, STORAGE, KEEP_AWAKE],
    };
  }

  async onModuleInit(): Promise<void> {
    this.boss.on("error", (err) => this.logger.error(err));
    await this.boss.start();
    await ensureQueues(this.boss);
    this.logger.log("pg-boss started");
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 30_000 }).catch(() => undefined);
    await this.handle.pool.end();
  }
}
