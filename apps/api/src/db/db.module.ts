import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { createDb, type Db, type DbHandle } from "@jfa/db";
import { createStorageFromEnv, type ObjectStorage } from "@jfa/core";
import { CONFIG, type AppConfig } from "../config";

export const DB = Symbol("DB");
export const DB_HANDLE = Symbol("DB_HANDLE");
export const STORAGE = Symbol("STORAGE");

@Global()
@Module({
  providers: [
    {
      provide: DB_HANDLE,
      inject: [CONFIG],
      useFactory: (config: AppConfig): DbHandle => createDb(config.DATABASE_URL),
    },
    { provide: DB, inject: [DB_HANDLE], useFactory: (h: DbHandle): Db => h.db },
    { provide: STORAGE, useFactory: (): ObjectStorage => createStorageFromEnv() },
  ],
  exports: [DB, DB_HANDLE, STORAGE],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly handle: DbHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.pool.end();
  }
}
