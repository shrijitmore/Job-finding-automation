import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { GmailClient, emailAddress, encryptJson, type GmailTokens } from "@jfa/core";
import { and, applications, credentials, desc, eq, inArray, jobs, replies, type Db } from "@jfa/db";
import { REPLY_CATEGORIES } from "@jfa/shared";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../common/current-user";
import { ZodPipe } from "../common/zod.pipe";
import { CONFIG, type AppConfig } from "../config";
import { DB } from "../db/db.module";
import { ProfilesService } from "../profiles/profiles.service";
import { CredentialsService } from "../settings/credentials.service";

const SendSchema = z.object({ body: z.string().trim().min(1).max(5000) });
const PatchSchema = z.object({ status: z.enum(["dismissed", "flagged"]) });

@Controller("profiles/:profileId/replies")
export class RepliesController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly profiles: ProfilesService,
    private readonly credentials: CredentialsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string, @Query("category") category?: string) {
    await this.profiles.get(user.id, profileId);
    const cats = category?.split(",").filter((c) => (REPLY_CATEGORIES as readonly string[]).includes(c));
    return this.db
      .select({
        id: replies.id,
        category: replies.category,
        status: replies.status,
        fromAddress: replies.fromAddress,
        subject: replies.subject,
        body: replies.body,
        summary: replies.summary,
        suggestedReply: replies.suggestedReply,
        sentReply: replies.sentReply,
        receivedAt: replies.receivedAt,
        handledAt: replies.handledAt,
        application: { id: applications.id, status: applications.status },
        job: { title: jobs.title, company: jobs.company },
      })
      .from(replies)
      .leftJoin(applications, eq(applications.id, replies.applicationId))
      .leftJoin(jobs, eq(jobs.id, applications.jobId))
      .where(and(eq(replies.profileId, profileId), cats?.length ? inArray(replies.category, cats as never) : undefined))
      .orderBy(desc(replies.receivedAt))
      .limit(200);
  }

  private async load(userId: string, profileId: string, id: string) {
    await this.profiles.get(userId, profileId);
    const [row] = await this.db.select().from(replies).where(and(eq(replies.id, id), eq(replies.profileId, profileId)));
    if (!row) throw new NotFoundException("Reply not found");
    return row;
  }

  @Patch(":replyId")
  async patch(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string, @Param("replyId", ParseUUIDPipe) id: string, @Body(new ZodPipe(PatchSchema)) body: z.infer<typeof PatchSchema>) {
    await this.load(user.id, profileId, id);
    const [row] = await this.db.update(replies).set({ status: body.status, handledAt: body.status === "dismissed" ? new Date() : null }).where(eq(replies.id, id)).returning();
    return row;
  }

  /** Sends the user's edited draft in the same Gmail thread. Only ever triggered by the user's click. */
  @Post(":replyId/send")
  async send(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string, @Param("replyId", ParseUUIDPipe) id: string, @Body(new ZodPipe(SendSchema)) body: z.infer<typeof SendSchema>) {
    const reply = await this.load(user.id, profileId, id);
    if (reply.status === "sent" || reply.status === "auto_replied") throw new BadRequestException("A reply was already sent for this message");
    const cred = await this.credentials.get<GmailTokens>(user.id, "gmail", profileId);
    if (!cred || !this.config.GOOGLE_CLIENT_ID || !this.config.GOOGLE_CLIENT_SECRET) throw new BadRequestException("Connect Gmail for this profile first");
    const [row] = await this.db.select({ id: credentials.id }).from(credentials).where(and(eq(credentials.profileId, profileId), eq(credentials.kind, "gmail")));
    const client = new GmailClient({
      oauth: { clientId: this.config.GOOGLE_CLIENT_ID, clientSecret: this.config.GOOGLE_CLIENT_SECRET },
      tokens: cred.value,
      onTokens: async (t) => {
        await this.db.update(credentials).set({ ciphertext: encryptJson(t, this.config.ENCRYPTION_KEY), updatedAt: new Date() }).where(eq(credentials.id, row.id));
      },
    });
    const thread = await client.getThread(reply.gmailThreadId);
    const original = thread.find((m) => m.id === reply.gmailMessageId);
    await client.send({
      from: String(cred.meta.email ?? ""),
      to: emailAddress(reply.fromAddress),
      subject: reply.subject.startsWith("Re:") ? reply.subject : `Re: ${reply.subject}`,
      text: body.body,
      threadId: reply.gmailThreadId,
      inReplyTo: original?.messageId || undefined,
      references: [original?.references, original?.messageId].filter(Boolean).join(" ") || undefined,
    });
    const [updated] = await this.db.update(replies).set({ status: "sent", sentReply: body.body, handledAt: new Date() }).where(eq(replies.id, id)).returning();
    return updated;
  }
}
