import { type DynamicModule, Module } from "@nestjs/common";
import type { WorkerConfig } from "./config";
import { FetchService } from "./fetch/fetch.service";
import { ScanProcessor } from "./fetch/scan.processor";
import { InfraModule } from "./infra.module";
import { LlmFactory } from "./llm/llm.factory";

@Module({})
export class WorkerModule {
  static forRoot(config: WorkerConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [InfraModule.forRoot(config)],
      providers: [LlmFactory, FetchService, ScanProcessor],
    };
  }
}
