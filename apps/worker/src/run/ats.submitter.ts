import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { FormApplier } from "@jfa/applier";
import type { Application, Job } from "@jfa/db";
import type { AtsKind } from "@jfa/shared";
import { CONFIG, type WorkerConfig } from "../config";
import { pdfFilename, type AtsSubmitter } from "./apply.service";
import type { RunContext } from "./run-context";

/** Greenhouse, Lever and Ashby form filling with Playwright. */
@Injectable()
export class PlaywrightAtsSubmitter implements AtsSubmitter, OnApplicationShutdown {
  private readonly applier: FormApplier;

  constructor(@Inject(CONFIG) config: WorkerConfig) {
    this.applier = new FormApplier(config.CHROMIUM_PATH);
  }

  async submit({ ctx, app, job, pdf }: { ctx: RunContext; app: Application; job: Job; pdf: Buffer }) {
    const res = await this.applier.apply({
      url: job.applyUrl ?? job.url,
      ats: job.ats as AtsKind,
      master: ctx.profile.masterResume!,
      coverNote: app.coverNote ?? "",
      pdf,
      pdfFilename: pdfFilename(ctx.profile.masterResume!),
      submit: true,
    });
    if (res.status !== "applied") ctx.log.warn("apply", `${job.company}: ${res.reason}`);
    return { status: res.status, reason: res.reason, screenshot: res.screenshot };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.applier.close();
  }
}
