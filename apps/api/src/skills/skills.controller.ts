import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Put } from "@nestjs/common";
import { suggestSkills } from "@jfa/core";
import { asc, eq, profileSkills, type Db } from "@jfa/db";
import { ProfileSkillSchema, type ProfileSkill } from "@jfa/shared";
import { z } from "zod";
import { CurrentUser, type SessionUser } from "../common/current-user";
import { ZodPipe } from "../common/zod.pipe";
import { DB } from "../db/db.module";
import { ProfilesService } from "../profiles/profiles.service";

const PutSchema = z.object({ skills: z.array(ProfileSkillSchema).max(500) });

@Controller("profiles/:profileId/skills")
export class SkillsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly profiles: ProfilesService,
  ) {}

  @Get()
  async list(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string) {
    const profile = await this.profiles.get(user.id, profileId);
    const rows = await this.db
      .select({ name: profileSkills.name, tier: profileSkills.tier })
      .from(profileSkills)
      .where(eq(profileSkills.profileId, profileId))
      .orderBy(asc(profileSkills.createdAt));
    return { skills: rows, suggestions: suggestSkills(profile.masterResume, rows.map((r) => r.name)) };
  }

  /** Replaces the profile's full skill list. Names are de-duplicated case-insensitively. */
  @Put()
  async replace(
    @CurrentUser() user: SessionUser,
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Body(new ZodPipe(PutSchema)) body: { skills: ProfileSkill[] },
  ) {
    await this.profiles.get(user.id, profileId);
    const unique = new Map<string, ProfileSkill>();
    for (const s of body.skills) {
      const name = s.name.trim();
      if (name && !unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), { name, tier: s.tier });
    }
    await this.db.transaction(async (tx) => {
      await tx.delete(profileSkills).where(eq(profileSkills.profileId, profileId));
      if (unique.size) await tx.insert(profileSkills).values([...unique.values()].map((s) => ({ profileId, ...s })));
    });
    return this.list(user, profileId);
  }
}
