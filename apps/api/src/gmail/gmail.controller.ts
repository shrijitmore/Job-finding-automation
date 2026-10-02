import { BadRequestException, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Query, Res } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Response } from "express";
import { GmailClient, exchangeGmailCode, gmailAuthUrl, type GoogleOAuthConfig } from "@jfa/core";
import { CONFIG, type AppConfig } from "../config";
import { CurrentUser, Public, type SessionUser } from "../common/current-user";
import { ProfilesService } from "../profiles/profiles.service";
import { CredentialsService } from "../settings/credentials.service";

@Controller()
export class GmailController {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly profiles: ProfilesService,
    private readonly credentials: CredentialsService,
  ) {}

  private oauth(): GoogleOAuthConfig {
    if (!this.config.GOOGLE_CLIENT_ID || !this.config.GOOGLE_CLIENT_SECRET) {
      throw new BadRequestException("Gmail is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README).");
    }
    return {
      clientId: this.config.GOOGLE_CLIENT_ID,
      clientSecret: this.config.GOOGLE_CLIENT_SECRET,
      redirectUri: `${this.config.API_PUBLIC_URL.replace(/\/$/, "")}/api/gmail/callback`,
    };
  }

  @Get("profiles/:profileId/gmail")
  async status(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string) {
    await this.profiles.get(user.id, profileId);
    const cred = await this.credentials.get(user.id, "gmail", profileId);
    return {
      serverConfigured: Boolean(this.config.GOOGLE_CLIENT_ID && this.config.GOOGLE_CLIENT_SECRET),
      connected: Boolean(cred),
      email: (cred?.meta.email as string | undefined) ?? null,
    };
  }

  @Post("profiles/:profileId/gmail/connect")
  async connect(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string) {
    await this.profiles.get(user.id, profileId);
    const state = await this.jwt.signAsync({ sub: user.id, profileId, purpose: "gmail" }, { expiresIn: "15m" });
    return { url: gmailAuthUrl(this.oauth(), state) };
  }

  @Delete("profiles/:profileId/gmail")
  async disconnect(@CurrentUser() user: SessionUser, @Param("profileId", ParseUUIDPipe) profileId: string) {
    await this.profiles.get(user.id, profileId);
    await this.credentials.remove(user.id, "gmail", profileId);
    return { connected: false };
  }

  /** Google redirects here. The signed state identifies the user and profile. */
  @Public()
  @Get("gmail/callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Query("error") error: string | undefined, @Res() res: Response) {
    const web = this.config.WEB_ORIGIN.split(",")[0].trim().replace(/\/$/, "");
    let payload: { sub: string; profileId: string; purpose: string };
    try {
      payload = await this.jwt.verifyAsync(state);
      if (payload.purpose !== "gmail") throw new Error("bad state");
    } catch {
      return res.redirect(`${web}/?gmail=invalid_state`);
    }
    const back = `${web}/p/${payload.profileId}/settings`;
    if (error || !code) return res.redirect(`${back}?gmail=denied`);
    try {
      const cfg = this.oauth();
      const tokens = await exchangeGmailCode(cfg, code);
      const client = new GmailClient({ oauth: cfg, tokens });
      const { emailAddress } = await client.profile();
      await this.credentials.set(payload.sub, "gmail", payload.profileId, tokens, { email: emailAddress });
      return res.redirect(`${back}?gmail=connected`);
    } catch (err) {
      return res.redirect(`${back}?gmail=error&message=${encodeURIComponent((err as Error).message.slice(0, 200))}`);
    }
  }
}
