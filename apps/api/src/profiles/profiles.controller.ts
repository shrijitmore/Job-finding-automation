import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { MasterResumeSchema, PreferencesSchema, ScheduleSchema, StyleRulesSchema } from "@jfa/shared";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../common/current-user";
import { ZodPipe } from "../common/zod.pipe";
import { type ProfilePatch, ProfilesService } from "./profiles.service";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  timezone: z.string().optional(),
});

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  masterResume: MasterResumeSchema.optional(),
  preferences: PreferencesSchema.optional(),
  schedule: ScheduleSchema.optional(),
  styleRules: StyleRulesSchema.optional(),
  onboarded: z.boolean().optional(),
});

@Controller("profiles")
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  async list(@CurrentUser() user: SessionUser) {
    const rows = await this.profiles.list(user.id);
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      onboarded: Boolean(p.onboardedAt),
      dryRun: p.schedule.dryRun,
      enabled: p.schedule.enabled,
      createdAt: p.createdAt,
    }));
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodPipe(CreateSchema)) body: z.infer<typeof CreateSchema>) {
    return this.profiles.create(user.id, body.name, body.timezone);
  }

  @Get(":id")
  get(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.profiles.get(user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: SessionUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(PatchSchema)) body: ProfilePatch,
  ) {
    return this.profiles.update(user.id, id, body);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.profiles.remove(user.id, id);
    return { ok: true };
  }
}
