import { Global, Module } from "@nestjs/common";
import { LlmService } from "../llm/llm.service";
import { CredentialsService } from "./credentials.service";
import { SettingsController } from "./settings.controller";

@Global()
@Module({
  controllers: [SettingsController],
  providers: [CredentialsService, LlmService],
  exports: [CredentialsService, LlmService],
})
export class SettingsModule {}
