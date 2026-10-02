import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { QUEUES, type PgBoss } from "@jfa/core";
import { and, asc, eq, profiles, type Db, type Profile } from "@jfa/db";
import {
  DEFAULT_PREFERENCES,
  DEFAULT_SCHEDULE,
  DEFAULT_STYLE_RULES,
  type MasterResume,
  type Preferences,
  type Schedule,
  type StyleRules,
} from "@jfa/shared";
import { DB } from "../db/db.module";
import { BOSS } from "../queue/queue.module";

export interface ProfilePatch {
  name?: string;
  masterResume?: MasterResume;
  preferences?: Preferences;
  schedule?: Schedule;
  styleRules?: StyleRules;
  onboarded?: boolean;
}

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(BOSS) private readonly boss: PgBoss,
  ) {}

  /** Asks the worker to rebuild cron schedules. Coalesced so bursts of edits send one job. */
  private async resyncSchedules(): Promise<void> {
    await this.boss.send(QUEUES.syncSchedules, {}, { singletonKey: "sync", singletonSeconds: 5 }).catch(() => undefined);
  }

  list(userId: string): Promise<Profile[]> {
    return this.db.select().from(profiles).where(eq(profiles.userId, userId)).orderBy(asc(profiles.createdAt));
  }

  async create(userId: string, name: string, timezone?: string): Promise<Profile> {
    const [row] = await this.db
      .insert(profiles)
      .values({
        userId,
        name,
        preferences: DEFAULT_PREFERENCES,
        schedule: { ...DEFAULT_SCHEDULE, timezone: timezone || DEFAULT_SCHEDULE.timezone },
        styleRules: DEFAULT_STYLE_RULES,
      })
      .returning();
    return row;
  }

  /** Loads a profile and verifies it belongs to the user. */
  async get(userId: string, profileId: string): Promise<Profile> {
    const [row] = await this.db
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)));
    if (!row) throw new NotFoundException("Profile not found");
    return row;
  }

  async update(userId: string, profileId: string, patch: ProfilePatch): Promise<Profile> {
    await this.get(userId, profileId);
    const { onboarded, ...rest } = patch;
    const [row] = await this.db
      .update(profiles)
      .set({
        ...rest,
        ...(onboarded === true ? { onboardedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profileId))
      .returning();
    if (patch.schedule || onboarded) await this.resyncSchedules();
    return row;
  }

  async remove(userId: string, profileId: string): Promise<void> {
    await this.get(userId, profileId);
    await this.db.delete(profiles).where(eq(profiles.id, profileId));
    await this.resyncSchedules();
  }
}
