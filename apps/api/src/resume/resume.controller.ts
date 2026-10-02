import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { RESUME_MIME, detectResumeKind, extractResumeText, parseResume, suggestSkills, type ObjectStorage } from "@jfa/core";
import { eq, profileSkills, profiles, type Db } from "@jfa/db";
import { CurrentUser, type SessionUser } from "../common/current-user";
import { DB, STORAGE } from "../db/db.module";
import { LlmService } from "../llm/llm.service";
import { ProfilesService } from "../profiles/profiles.service";

const MAX_BYTES = 10 * 1024 * 1024;

@Controller("profiles/:profileId/resume")
export class ResumeController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    private readonly profiles: ProfilesService,
    private readonly llm: LlmService,
  ) {}

  /** Stores the file, extracts text and returns a parsed draft for the user to review before saving. */
  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_BYTES } }))
  async upload(
    @CurrentUser() user: SessionUser,
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.profiles.get(user.id, profileId);
    if (!file) throw new BadRequestException("Attach a PDF or DOCX file as 'file'");
    const kind = detectResumeKind(file.originalname, file.mimetype);
    if (!kind) throw new BadRequestException("Only PDF and DOCX resumes are supported");

    let text: string;
    try {
      text = await extractResumeText(file.buffer, kind);
    } catch {
      throw new BadRequestException("Could not read that file. Is it a valid PDF or DOCX?");
    }
    if (text.length < 50 && kind === "docx") throw new BadRequestException("The resume looks empty");

    const key = `profiles/${profileId}/resume/${Date.now()}.${kind}`;
    await this.storage.put(key, file.buffer, RESUME_MIME[kind]);
    await this.db
      .update(profiles)
      .set({ resumeFileKey: key, resumeText: text, updatedAt: new Date() })
      .where(eq(profiles.id, profileId));

    const llm = await this.llm.forProfile(user.id, profileId);
    const { resume } = await parseResume(llm, {
      text,
      pdfBase64: kind === "pdf" ? file.buffer.toString("base64") : undefined,
    });
    const existing = await this.db.select().from(profileSkills).where(eq(profileSkills.profileId, profileId));
    return { draft: resume, suggestedSkills: suggestSkills(resume, existing.map((s) => s.name)) };
  }

  @Get("file")
  async download(
    @CurrentUser() user: SessionUser,
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Res() res: Response,
  ) {
    const profile = await this.profiles.get(user.id, profileId);
    if (!profile.resumeFileKey) throw new NotFoundException("No resume uploaded");
    const body = await this.storage.get(profile.resumeFileKey);
    const ext = profile.resumeFileKey.endsWith(".pdf") ? "pdf" : "docx";
    res.setHeader("Content-Type", RESUME_MIME[ext]);
    res.setHeader("Content-Disposition", `inline; filename="resume.${ext}"`);
    res.send(body);
  }
}
