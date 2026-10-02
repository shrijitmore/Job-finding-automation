import { Module } from "@nestjs/common";
import { ApplicationsController } from "../applications/applications.controller";
import { AuthModule } from "../auth/auth.module";
import { GmailController } from "../gmail/gmail.controller";
import { RepliesController } from "../replies/replies.controller";
import { ResumeController } from "../resume/resume.controller";
import { RunsController } from "../runs/runs.controller";
import { SkillsController } from "../skills/skills.controller";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";

@Module({
  imports: [AuthModule],
  controllers: [ProfilesController, ResumeController, SkillsController, RunsController, ApplicationsController, GmailController, RepliesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
