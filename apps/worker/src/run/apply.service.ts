import { Inject, Injectable } from "@nestjs/common";
import type { ObjectStorage } from "@jfa/core";
import { and, applications, eq, isNull, jobs, type Application, type Db, type Job } from "@jfa/db";
import type { MasterResume } from "@jfa/shared";
import { CONFIG, type WorkerConfig } from "../config";
import { DB, STORAGE } from "../infra.module";
import type { RunContext } from "./run-context";

/** Submits to an ATS form. Phase 6 registers Greenhouse, Lever and Ashby handlers. */
export interface AtsSubmitter {
  submit(input: { ctx: RunContext; app: Application; job: Job; pdf: Buffer }): Promise<{ screenshot?: Buffer; status: "applied" | "manual"; reason?: string }>;
}

export const ATS_SUBMITTER = Symbol("ATS_SUBMITTER");

export function emailSubject(job: Pick<Job, "title">, master: MasterResume): string {
  return `Application: ${job.title} (${master.contact.name})`;
}

export function emailBody(coverNote: string, master: MasterResume): string {
  const sig = [master.contact.name, master.contact.phone, master.contact.email, master.portfolioLinks[0]?.url].filter(Boolean).join("\n");
  return `${coverNote.trim()}\n\nResume attached.\n\n${sig}\n`;
}

export function pdfFilename(master: MasterResume): string {
  return `${master.contact.name.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "") || "Resume"}_Resume.pdf`;
}

@Injectable()
export class ApplyService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    @Inject(CONFIG) private readonly config: WorkerConfig,
    @Inject(ATS_SUBMITTER) private readonly ats: AtsSubmitter | null,
  ) {}

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private delay(): number {
    const { APPLY_MIN_DELAY_MS: min, APPLY_MAX_DELAY_MS: max } = this.config;
    return min + Math.random() * Math.max(0, max - min);
  }

  private async set(id: string, patch: Partial<Application>) {
    await this.db.update(applications).set({ ...patch, updatedAt: new Date() }).where(eq(applications.id, id));
  }

  /**
   * Marks an application as being submitted. Returns false if an earlier attempt already
   * started, so a crashed and retried run never sends twice.
   */
  private async claim(id: string): Promise<boolean> {
    const rows = await this.db
      .update(applications)
      .set({ submitStartedAt: new Date() })
      .where(and(eq(applications.id, id), isNull(applications.submitStartedAt)))
      .returning({ id: applications.id });
    return rows.length === 1;
  }

  async applyAll(ctx: RunContext, apps: Application[]): Promise<void> {
    const tally = { applied: 0, dryRun: 0, manual: 0, failed: 0 };
    const dryRun = ctx.run.dryRun;
    let sentSomething = false;

    for (const app of apps) {
      const [job] = await this.db.select().from(jobs).where(eq(jobs.id, app.jobId));
      const channel = app.applyChannel ?? "manual";
      const target = channel === "email" ? job.applyEmail! : job.applyUrl ?? job.url;

      if (channel === "manual") {
        await this.set(app.id, { status: "manual_apply", applyTarget: target });
        tally.manual++;
        continue;
      }
      if (dryRun) {
        await this.set(app.id, { status: "dry_run", applyTarget: target });
        ctx.log.info("apply", `[dry run] Would apply to ${job.title} at ${job.company} via ${channel} (${target})`);
        tally.dryRun++;
        continue;
      }

      if (!(await this.claim(app.id))) {
        await this.set(app.id, { status: "failed", error: "An earlier attempt was interrupted while submitting. Not retried to avoid applying twice; check manually." });
        await ctx.log.error("apply", `Skipped ${job.title} at ${job.company}: previous submit attempt was interrupted`, { jobId: job.id });
        tally.failed++;
        continue;
      }
      // Random pause between real submissions.
      if (sentSomething) await this.sleep(this.delay());

      try {
        const pdf = await this.storage.get(app.pdfKey!);
        if (channel === "email") {
          if (!ctx.mailer) throw new Error("Gmail is not connected for this profile");
          const master = ctx.profile.masterResume!;
          const sent = await ctx.mailer.send({
            to: job.applyEmail!,
            subject: emailSubject(job, master),
            text: emailBody(app.coverNote ?? "", master),
            attachments: [{ filename: pdfFilename(master), contentType: "application/pdf", content: pdf }],
            headers: { "X-JFA-Application": app.id },
          });
          await this.set(app.id, { status: "applied", applyTarget: target, appliedAt: new Date(), gmailThreadId: sent.threadId, gmailMessageId: sent.id });
          tally.applied++;
        } else {
          if (!this.ats) {
            await this.set(app.id, { status: "manual_apply", applyTarget: target, skipReason: "Form filling is not enabled; apply with the link" });
            tally.manual++;
            continue;
          }
          const res = await this.ats.submit({ ctx, app, job, pdf });
          let screenshotKey: string | null = null;
          if (res.screenshot) {
            screenshotKey = `profiles/${ctx.profile.id}/applications/${app.id}/confirmation.png`;
            await this.storage.put(screenshotKey, res.screenshot, "image/png");
          }
          if (res.status === "applied") {
            await this.set(app.id, { status: "applied", applyTarget: target, appliedAt: new Date(), screenshotKey });
            tally.applied++;
          } else {
            await this.set(app.id, { status: "manual_apply", applyTarget: target, skipReason: res.reason ?? null, screenshotKey });
            tally.manual++;
          }
        }
        sentSomething = true;
        ctx.log.info("apply", `Applied to ${job.title} at ${job.company} via ${channel}`);
      } catch (err) {
        await this.set(app.id, { status: "failed", error: (err as Error).message });
        await ctx.log.error("apply", `Apply failed for ${job.title} at ${job.company}: ${(err as Error).message}`, { jobId: job.id });
        tally.failed++;
      }
    }
    await ctx.log.stats(tally);
  }
}
