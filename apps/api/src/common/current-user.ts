import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";

export interface SessionUser {
  id: string;
  email: string;
}

export const IS_PUBLIC = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  const req = ctx.switchToHttp().getRequest<{ user: SessionUser }>();
  return req.user;
});
