import { Body, Controller, Delete, Get, Put } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../common/current-user";
import { ZodPipe } from "../common/zod.pipe";
import { CredentialsService } from "./credentials.service";

const AnthropicSchema = z.object({ apiKey: z.string().trim().min(10).max(500) });

@Controller("settings")
export class SettingsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get()
  async get(@CurrentUser() user: SessionUser) {
    return { anthropic: await this.credentials.anthropicStatus(user.id) };
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
