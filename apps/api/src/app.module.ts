import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import type { AppConfig } from "./config";
import { ConfigModule } from "./config.module";
import { DbModule } from "./db/db.module";
import { HealthController } from "./health.controller";
import { ProfilesModule } from "./profiles/profiles.module";
import { QueueModule } from "./queue/queue.module";
import { SettingsModule } from "./settings/settings.module";
import { SourcesModule } from "./sources/sources.module";

@Module({})
export class AppModule {
  static forRoot(config?: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
        DbModule,
        QueueModule,
        AuthModule,
        SettingsModule,
        ProfilesModule,
        SourcesModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    };
  }
}
