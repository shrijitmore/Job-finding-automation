import { Inject, Injectable } from "@nestjs/common";
import { escapeHtml } from "@jfa/core";
import { and, applications, desc, eq, jobs, runs, type Db } from "@jfa/db";
import { CONFIG, type WorkerConfig } from "../config";
import { DB } from "../infra.module";
import { NOTIFIER_FACTORY, type NotifierFactory } from "../notify/telegram.factory";
import type { RunContext } from "./run-context";

/** Builds the per-run summary and sends it to Telegram. */
@Injectable()
export class NotifyService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: WorkerConfig,
    @Inject(NOTIFIER_FACTORY) private readonly notifiers: NotifierFactory,
  ) {}

  async summary(ctx: RunContext, blocked: string[]): Promise<string> {
    const rows = await this.db
      .select({ status: applications.status, title: jobs.title, company: jobs.company, target: applications.applyTarget, reason: applications.skipReason, error: applications.error, url: jobs.url, score: applications.fitScore })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(eq(applications.runId, ctx.run.id)))
      .orderBy(desc(applications.fitScore));
    const [run] = await this.db.select().from(runs).where(eq(runs.id, ctx.run.id));
    const by = (s: string) => rows.filter((r) => r.status === s);
    const line = (r: (typeof rows)[number]) => `• ${escapeHtml(r.title)} at ${escapeHtml(r.company)}${r.score != null ? ` (${r.score})` : ""}`;
    const applied = by("applied");
    const dry = by("dry_run");
    const manual = by("manual_apply");
    const skipped = rows.filter((r) => ["skipped", "validation_failed"].includes(r.status));
    const failed = by("failed");
    const reasons = skipped.reduce<Record<string, number>>((acc, r) => {
      const k = (r.reason ?? "Skipped").replace(/\d+/g, "N").replace(/: .*/, "");
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    const parts = [
      `🤖 <b>${escapeHtml(ctx.profile.name)}</b> run ${run.status === "succeeded" || run.status === "running" ? "finished" : run.status}${ctx.run.dryRun ? " (dry run, nothing sent)" : ""}`,
      `Fetched ${run.stats.fetched ?? 0} jobs, ${run.stats.newJobs ?? 0} new, ${run.stats.filtered ?? 0} passed filters, ${run.stats.scored ?? 0} scored.`,
    ];
    if (applied.length) parts.push(`\n✅ <b>Applied (${applied.length})</b>\n${applied.map(line).join("\n")}`);
    if (dry.length) parts.push(`\n🧪 <b>Would apply (${dry.length})</b>\n${dry.map(line).join("\n")}`);
    if (manual.length) parts.push(`\n👉 <b>Apply manually (${manual.length})</b>\n${manual.map((r) => `${line(r)}\n  ${escapeHtml(r.target ?? r.url)}`).join("\n")}`);
    if (skipped.length) parts.push(`\n⏭ <b>Skipped (${skipped.length})</b>\n${Object.entries(reasons).map(([k, n]) => `• ${escapeHtml(k)}: ${n}`).join("\n")}`);
    if (failed.length) parts.push(`\n❌ <b>Failed (${failed.length})</b>\n${failed.map((r) => `${line(r)}: ${escapeHtml((r.error ?? "").slice(0, 120))}`).join("\n")}`);
    if (blocked.length) parts.push(`\n🚧 <b>Blocked sources</b>: ${blocked.map(escapeHtml).join(", ")}`);
    if (run.errors.length) parts.push(`\n⚠️ ${run.errors.length} errors. ${escapeHtml(run.errors.slice(0, 3).map((e) => `${e.step}: ${e.message}`).join("; ").slice(0, 400))}`);
    parts.push(`\n💸 Claude: ${(run.inputTokens + run.outputTokens).toLocaleString()} tokens, $${Number(run.costUsd).toFixed(3)}`);
    parts.push(`${this.config.WEB_PUBLIC_URL.replace(/\/$/, "")}/p/${ctx.profile.id}/runs/${ctx.run.id}`);
    return parts.join("\n");
  }

  async send(ctx: RunContext, state: { blocked: string[] }): Promise<void> {
    const text = await this.summary(ctx, state.blocked);
    ctx.log.info("notify", "Run summary", { summary: text });
    const notifier = await this.notifiers.forUser(ctx.userId);
    if (!notifier) {
      ctx.log.info("notify", "Telegram not connected; summary saved to the run log only");
      return;
    }
    try {
      await notifier.send(text);
    } catch (err) {
      await ctx.log.error("notify", `Telegram failed: ${(err as Error).message}`);
    }
  }
}
