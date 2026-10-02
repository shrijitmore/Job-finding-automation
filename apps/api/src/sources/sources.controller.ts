import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { FieldSchema, SOURCE_PLUGINS } from "@jfa/shared";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../common/current-user";
import { ZodPipe } from "../common/zod.pipe";
import { type CreateSourceInput, SourcesService } from "./sources.service";

const ConfigSchema = z.object({
  render: z.boolean().optional(),
  maxListings: z.number().int().min(1).max(200).optional(),
  followDetails: z.boolean().optional(),
});

const CreateSchema = z.object({
  url: z.string().min(4).max(2000),
  name: z.string().max(100).optional(),
  plugin: z.enum(SOURCE_PLUGINS).optional(),
  fields: z.array(FieldSchema).min(1),
  config: ConfigSchema.optional(),
});

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  fields: z.array(FieldSchema).min(1).optional(),
  config: ConfigSchema.optional(),
});

@Controller("sources")
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.sources.list(user.id);
  }

  @Get("proposed")
  proposed(@CurrentUser() user: SessionUser) {
    return this.sources.proposed(user.id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodPipe(CreateSchema)) body: CreateSourceInput) {
    return this.sources.create(user.id, body);
  }

  @Patch(":id")
  update(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(PatchSchema)) body: z.infer<typeof PatchSchema>) {
    return this.sources.update(user.id, id, body);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.sources.remove(user.id, id);
    return { ok: true };
  }

  @Post(":id/scan")
  scan(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.sources.scan(user.id, id);
  }
}
