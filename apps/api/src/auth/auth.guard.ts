import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { IS_PUBLIC, type SessionUser } from "../common/current-user";
import { AuthService } from "./auth.service";

export const SESSION_COOKIE = "jfa_session";

export function tokenFromRequest(req: Request): string | undefined {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (cookie) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return undefined;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const token = tokenFromRequest(req);
    if (!token) throw new UnauthorizedException();
    try {
      req.user = await this.auth.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
