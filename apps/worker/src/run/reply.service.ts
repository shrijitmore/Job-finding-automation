import { Inject, Injectable } from "@nestjs/common";
import { emailAddress, stripQuoted, type ObjectStorage } from "@jfa/core";
import { and, applications, eq, inArray, isNotNull, jobs, replies, type Db } from "@jfa/db";
import { classifyReply, portfolioReply, resumeReply } from "@jfa/pipeline";
import { AUTO_REPLY_CATEGORIES, type ReplyCategory } from "@jfa/shared";
import { escapeHtml } from "@jfa/core";
import { DB, STORAGE } from "../infra.module";
import { NOTIFIER_FACTORY, type NotifierFactory } from "../notify/telegram.factory";
import { pdfFilename } from "./apply.service";
import type { RunContext } from "./run-context";

const STATUS_FOR: Partial<Record<ReplyCategory, "interview" | "rejected" | "replied">> = {
  interview_scheduling: "interview",
  rejection: "rejected",
};

/**
 * Start of each run: reads new replies on threads the agent started, classifies them and
 * auto-replies only to resume and portfolio requests. Interview, salary and assessment
 * messages are flagged with a draft for the user; rejections are recorded.
 */
@Injectable()
export class ReplyService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    @Inject(NOTIFIER_FACTORY) private readonly notifiers: NotifierFactory,
  ) {}

  async handle(ctx: RunContext): Promise<void> {
    if (!ctx.mailer) {
      ctx.log.info("replies", "Gmail not connected; skipping reply check");
      return;
    }
    if (!ctx.llm) return;
    const threads = await this.db
      .select({ app: applications, job: jobs })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(eq(applications.profileId, ctx.profile.id), isNotNull(applications.gmailThreadId), inArray(applications.status, ["applied", "replied", "interview"])));
    const me = ctx.mailer.address.toLowerCase();
    let processed = 0;
    const flagged: string[] = [];

    for (const { app, job } of threads) {
      let messages;
      try {
        messages = await ctx.mailer.getThread(app.gmailThreadId!);
      } catch (err) {
        await ctx.log.error("replies", `Could not read thread for ${job.company}: ${(err as Error).message}`);
        continue;
      }
      const known = new Set(
        (await this.db.select({ id: replies.gmailMessageId }).from(replies).where(eq(replies.applicationId, app.id))).map((r) => r.id),
      );
      const incoming = messages.filter((m) => emailAddress(m.from) !== me && !known.has(m.id) && m.id !== app.gmailMessageId);
      for (const msg of incoming) {
        const text = stripQuoted(msg.text);
        const cls = await classifyReply(ctx.llm, { text, subject: msg.subject, from: msg.from, jobTitle: job.title, company: job.company, master: ctx.profile.masterResume! });
        const [row] = await this.db
          .insert(replies)
          .values({
            profileId: ctx.profile.id,
            applicationId: app.id,
            gmailThreadId: msg.threadId,
            gmailMessageId: msg.id,
            fromAddress: msg.from,
            subject: msg.subject,
            body: text,
            receivedAt: new Date(msg.internalDate),
            category: cls.category,
            confidence: cls.confidence.toFixed(3),
            summary: cls.summary,
            suggestedReply: cls.suggested_reply,
            status: "new",
          })
          .onConflictDoNothing()
          .returning();
        if (!row) continue;
        processed++;

        let status: (typeof replies.$inferSelect)["status"] = "flagged";
        if (AUTO_REPLY_CATEGORIES.includes(cls.category)) {
          const body = cls.category === "resume_request" ? resumeReply(ctx.profile.masterResume!) : portfolioReply(ctx.profile.masterResume!);
          if (!body) {
            status = "flagged";
          } else if (ctx.run.dryRun) {
            status = "auto_reply_pending";
            ctx.log.info("replies", `[dry run] Would auto-reply to ${job.company} (${cls.category})`);
          } else {
            const pdf = app.pdfKey ? await this.storage.get(app.pdfKey) : null;
            await ctx.mailer.send({
              to: emailAddress(msg.from),
              subject: msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`,
              text: body,
              threadId: msg.threadId,
              inReplyTo: msg.messageId || undefined,
              references: [msg.references, msg.messageId].filter(Boolean).join(" ") || undefined,
              attachments: pdf ? [{ filename: pdfFilename(ctx.profile.masterResume!), contentType: "application/pdf", content: pdf }] : [],
            });
            status = "auto_replied";
            ctx.log.info("replies", `Auto-replied to ${job.company} (${cls.category})`);
          }
          await this.db.update(replies).set({ status, sentReply: status === "auto_replied" ? body : null, handledAt: status === "auto_replied" ? new Date() : null }).where(eq(replies.id, row.id));
        } else if (cls.category === "rejection") {
          status = "dismissed";
          await this.db.update(replies).set({ status, handledAt: new Date() }).where(eq(replies.id, row.id));
        } else {
          await this.db.update(replies).set({ status: "flagged" }).where(eq(replies.id, row.id));
          flagged.push(`<b>${escapeHtml(job.company)}</b> (${cls.category.replace(/_/g, " ")}): ${escapeHtml(cls.summary)}`);
        }
        await this.db
          .update(applications)
          .set({ status: STATUS_FOR[cls.category] ?? (app.status === "interview" ? "interview" : "replied"), updatedAt: new Date() })
          .where(eq(applications.id, app.id));
      }
    }
    await ctx.log.stats({ repliesProcessed: processed });
    ctx.log.info("replies", `Processed ${processed} new replies, ${flagged.length} flagged`);
    if (flagged.length) {
      const notifier = await this.notifiers.forUser(ctx.userId);
      await notifier
        ?.send(`📬 <b>${escapeHtml(ctx.profile.name)}</b>: ${flagged.length} repl${flagged.length > 1 ? "ies need" : "y needs"} you\n\n${flagged.join("\n")}\n\nOpen the Inbox to review the suggested drafts.`)
        .catch((err) => ctx.log.warn("replies", `Telegram alert failed: ${(err as Error).message}`));
    }
  }
}
