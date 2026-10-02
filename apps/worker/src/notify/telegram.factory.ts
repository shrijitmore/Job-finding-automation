import { Inject, Injectable } from "@nestjs/common";
import { decryptJson, sendTelegram, type TelegramConfig } from "@jfa/core";
import { and, credentials, eq, isNull, type Db } from "@jfa/db";
import { CONFIG, type WorkerConfig } from "../config";
import { DB } from "../infra.module";

export interface Notifier {
  send(html: string): Promise<void>;
}

export const NOTIFIER_FACTORY = Symbol("NOTIFIER_FACTORY");

export interface NotifierFactory {
  forUser(userId: string): Promise<Notifier | null>;
}

/** Telegram bot configured in Settings (encrypted), falling back to TELEGRAM_BOT_TOKEN plus a saved chat id. */
@Injectable()
export class TelegramNotifierFactory implements NotifierFactory {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: WorkerConfig,
  ) {}

  async forUser(userId: string): Promise<Notifier | null> {
    const [row] = await this.db
      .select()
      .from(credentials)
      .where(and(eq(credentials.userId, userId), eq(credentials.kind, "telegram"), isNull(credentials.profileId)));
    if (!row) return null;
    const cfg = decryptJson<TelegramConfig>(row.ciphertext, this.config.ENCRYPTION_KEY);
    if (!cfg.chatId || !(cfg.botToken || this.config.TELEGRAM_BOT_TOKEN)) return null;
    const full = { chatId: cfg.chatId, botToken: cfg.botToken || this.config.TELEGRAM_BOT_TOKEN! };
    return { send: (html) => sendTelegram(full, html) };
  }
}
