import { type DynamicModule, Module } from "@nestjs/common";
import type { WorkerConfig } from "./config";
import { InfraModule } from "./infra.module";

@Module({})
export class WorkerModule {
  static forRoot(config: WorkerConfig): DynamicModule {
    return { module: WorkerModule, imports: [InfraModule.forRoot(config)] };
  }
}
