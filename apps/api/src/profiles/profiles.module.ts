import { Module } from "@nestjs/common";
import { ResumeController } from "../resume/resume.controller";
import { SkillsController } from "../skills/skills.controller";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";

@Module({
  controllers: [ProfilesController, ResumeController, SkillsController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
