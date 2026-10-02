import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { z } from "zod";
import { CONFIG, type AppConfig } from "../config";
import { CurrentUser, Public, type SessionUser } from "../common/current-user";
import { ZodPipe } from "../common/zod.pipe";
import { AuthService } from "./auth.service";
import { SESSION_COOKIE, tokenFromRequest } from "./auth.guard";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
type Credentials = z.infer<typeof CredentialsSchema>;

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
/** Login and setup attempts allowed per minute per IP. */
const AUTH_LIMIT = Number(process.env.AUTH_RATE_LIMIT ?? 10);

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get("status")
  async status(@Req() req: Request) {
    const hasOwner = await this.auth.hasOwner();
    let user: SessionUser | null = null;
    const token = tokenFromRequest(req);
    if (token) user = await this.auth.verify(token).catch(() => null);
    return { hasOwner, setupAllowed: !hasOwner && this.config.ALLOW_SETUP, user };
  }

  @Public()
  @Throttle({ default: { limit: AUTH_LIMIT, ttl: 60_000 } })
  @Post("setup")
  async setup(@Body(new ZodPipe(CredentialsSchema)) body: Credentials, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.setupOwner(body.email, body.password);
    await this.setCookie(res, user);
    return { user };
  }

  @Public()
  @Throttle({ default: { limit: AUTH_LIMIT, ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  async login(@Body(new ZodPipe(CredentialsSchema)) body: Credentials, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.login(body.email, body.password);
    const token = await this.setCookie(res, user);
    return { user, token };
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: SessionUser) {
    return { user };
  }

  private async setCookie(res: Response, user: SessionUser): Promise<string> {
    const token = await this.auth.sign(user);
    const secure = this.config.COOKIE_SECURE
      ? this.config.COOKIE_SECURE === "true"
      : this.config.NODE_ENV === "production";
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure,
      // Cross-site cookies are needed when web and api live on different domains.
      sameSite: secure ? "none" : "lax",
      maxAge: SESSION_MAX_AGE_MS,
      path: "/",
    });
    return token;
  }
}
