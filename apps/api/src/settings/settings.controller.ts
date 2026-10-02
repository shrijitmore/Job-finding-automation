import { BadRequestException, Body, Controller, Delete, Get, Post, Put } from "@nestjs/common";
import { maskSecret, sendTelegram, type TelegramConfig } from "@jfa/core";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../common/current-user";
import { ZodPipe } from "../common/zod.pipe";
import { CredentialsService } from "./credentials.service";

const AnthropicSchema = z.object({ apiKey: z.string().trim().min(10).max(500) });
const TelegramSchema = z.object({
  botToken: z.string().trim().regex(/^\d+:[A-Za-z0-9_-]{20,}$/, "That doesn't look like a bot token from @BotFather"),
  chatId: z.string().trim().regex(/^-?\d+$|^@[A-Za-z0-9_]{4,}$/, "Chat ID is a number (or @channel)"),
});

@Controller("settings")
export class SettingsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get()
  async get(@CurrentUser() user: SessionUser) {
    return { anthropic: await this.credentials.anthropicStatus(user.id), telegram: await this.telegramStatus(user.id) };
  }

  private async telegramStatus(userId: string) {
    const t = await this.credentials.get<TelegramConfig>(userId, "telegram");
    return { configured: Boolean(t), chatId: t?.value.chatId ?? null, botToken: t ? maskSecret(t.value.botToken) : null };
  }

  @Put("telegram")
  async setTelegram(@CurrentUser() user: SessionUser, @Body(new ZodPipe(TelegramSchema)) body: TelegramConfig) {
    await this.credentials.set(user.id, "telegram", null, body);
    return this.telegramStatus(user.id);
  }

  @Delete("telegram")
  async removeTelegram(@CurrentUser() user: SessionUser) {
    await this.credentials.remove(user.id, "telegram");
    return this.telegramStatus(user.id);
  }

  @Post("telegram/test")
  async testTelegram(@CurrentUser() user: SessionUser) {
    const t = await this.credentials.get<TelegramConfig>(user.id, "telegram");
    if (!t) throw new BadRequestException("Save a bot token and chat ID first");
    try {
      await sendTelegram(t.value, "✅ Job Autopilot is connected. Run summaries and reply alerts will arrive here.");
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    return { ok: true };
  }

  @Put("anthropic")
  async setAnthropic(@CurrentUser() user: SessionUser, @Body(new ZodPipe(AnthropicSchema)) body: z.infer<typeof AnthropicSchema>) {
    await this.credentials.set(user.id, "anthropic", null, { apiKey: body.apiKey });
    return this.credentials.anthropicStatus(user.id);
  }

  @Delete("anthropic")
  async removeAnthropic(@CurrentUser() user: SessionUser) {
    await this.credentials.remove(user.id, "anthropic");
    return this.credentials.anthropicStatus(user.id);
  }
}
