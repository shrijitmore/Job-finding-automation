import { Module } from "@nestjs/common";
import { SourcesController } from "./sources.controller";
import { SourcesService } from "./sources.service";

@Module({ controllers: [SourcesController], providers: [SourcesService], exports: [SourcesService] })
export class SourcesModule {}
