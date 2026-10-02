import { Inject, Injectable } from "@nestjs/common";
import { GmailClient, decryptJson, encryptJson, type GmailMessage, type GmailTokens, type OutgoingMail } from "@jfa/core";
import { and, credentials, eq, type Db } from "@jfa/db";
import { CONFIG, type WorkerConfig } from "../config";
import { DB } from "../infra.module";

/** What the pipeline needs from an email account. Gmail in production, a fake in tests. */
export interface Mailer {
  address: string;
  send(mail: OutgoingMail): Promise<{ id: string; threadId: string }>;
  getThread(threadId: string): Promise<GmailMessage[]>;
  markRead(messageId: string): Promise<void>;
}

export const MAILER_FACTORY = Symbol("MAILER_FACTORY");

export interface MailerFactory {
  forProfile(profileId: string): Promise<Mailer | null>;
}

/** Builds a Gmail client from the profile's encrypted OAuth tokens and saves refreshed tokens. */
@Injectable()
export class GmailMailerFactory implements MailerFactory {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: WorkerConfig,
  ) {}

  async forProfile(profileId: string): Promise<Mailer | null> {
    const [row] = await this.db
      .select()
      .from(credentials)
      .where(and(eq(credentials.profileId, profileId), eq(credentials.kind, "gmail")));
    if (!row || !this.config.GOOGLE_CLIENT_ID || !this.config.GOOGLE_CLIENT_SECRET) return null;
    const tokens = decryptJson<GmailTokens>(row.ciphertext, this.config.ENCRYPTION_KEY);
    const client = new GmailClient({
      oauth: { clientId: this.config.GOOGLE_CLIENT_ID, clientSecret: this.config.GOOGLE_CLIENT_SECRET },
      tokens,
      onTokens: async (t) => {
        await this.db
          .update(credentials)
          .set({ ciphertext: encryptJson(t, this.config.ENCRYPTION_KEY), updatedAt: new Date() })
          .where(eq(credentials.id, row.id));
      },
    });
    const address = String(row.meta.email ?? "");
    return {
      address,
      send: (m) => client.send({ ...m, from: m.from ?? address }),
      getThread: (id) => client.getThread(id),
      markRead: (id) => client.markRead(id),
    };
  }
}
