import { type DynamicModule, Module, type Provider } from "@nestjs/common";
import type { WorkerConfig } from "./config";
import { FetchService } from "./fetch/fetch.service";
import { ScanProcessor } from "./fetch/scan.processor";
import { InfraModule } from "./infra.module";
import { LlmFactory } from "./llm/llm.factory";
import { GmailMailerFactory, MAILER_FACTORY } from "./mail/mailer";
import { ATS_SUBMITTER, ApplyService } from "./run/apply.service";
import { NotifyService, ReplyService } from "./run/hooks";
import { ProfileRunService } from "./run/profile-run.service";
import { SchedulerService } from "./run/scheduler.service";
import { RunSteps } from "./run/steps.service";

export interface WorkerOverrides {
  mailerFactory?: Provider;
  atsSubmitter?: Provider;
  /** Skip queue consumers and cron sync (tests drive services directly). */
  noConsumers?: boolean;
}

@Module({})
export class WorkerModule {
  static forRoot(config: WorkerConfig, overrides: WorkerOverrides = {}): DynamicModule {
    return {
      module: WorkerModule,
      imports: [InfraModule.forRoot(config)],
      providers: [
        LlmFactory,
        FetchService,
        RunSteps,
        ApplyService,
        ReplyService,
        NotifyService,
        ProfileRunService,
        overrides.mailerFactory ?? { provide: MAILER_FACTORY, useClass: GmailMailerFactory },
        overrides.atsSubmitter ?? { provide: ATS_SUBMITTER, useValue: null },
        ...(overrides.noConsumers ? [] : [ScanProcessor, SchedulerService]),
      ],
      exports: [ProfileRunService, FetchService, RunSteps],
    };
  }
}
