import { type DynamicModule, Global, Module } from "@nestjs/common";
import { CONFIG, type AppConfig, loadConfig } from "./config";

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config?: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG, useValue: config ?? loadConfig() }],
      exports: [CONFIG],
    };
  }
}
