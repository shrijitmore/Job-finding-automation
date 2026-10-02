import { ConflictException, ForbiddenException, Inject, Injectable, Logger, type OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { eq, sql, users, type Db } from "@jfa/db";
import { CONFIG, type AppConfig } from "../config";
import { DB } from "../db/db.module";
import type { SessionUser } from "../common/current-user";

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
  ) {}

  /** Seeds or updates the owner from OWNER_EMAIL / OWNER_PASSWORD when both are set. */
  async onModuleInit(): Promise<void> {
    const { OWNER_EMAIL, OWNER_PASSWORD } = this.config;
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const email = OWNER_EMAIL.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 12);
    await this.db
      .insert(users)
      .values({ email, passwordHash })
      .onConflictDoUpdate({ target: users.email, set: { passwordHash } });
    this.logger.log(`Owner account ensured for ${email}`);
  }

  async hasOwner(): Promise<boolean> {
    const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(users);
    return (row?.n ?? 0) > 0;
  }

  async setupOwner(email: string, password: string): Promise<SessionUser> {
    if (!this.config.ALLOW_SETUP) throw new ForbiddenException("Setup is disabled");
    if (await this.hasOwner()) throw new ConflictException("An owner account already exists");
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await this.db
      .insert(users)
      .values({ email: email.trim().toLowerCase(), passwordHash })
      .returning();
    return { id: user.id, email: user.email };
  }

  async login(email: string, password: string): Promise<SessionUser> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()));
    // Compare against a dummy hash when the user is missing to keep timing similar.
    const hash = user?.passwordHash ?? "$2a$12$C6UzMDM.H6dfI/f/IKcEeO5x8m9Q3o7oQb2HfGz1T8bS4WfS3t1lK";
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) throw new UnauthorizedException("Invalid email or password");
    return { id: user.id, email: user.email };
  }

  sign(user: SessionUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, email: user.email });
  }

  async verify(token: string): Promise<SessionUser> {
    const payload = await this.jwt.verifyAsync<{ sub: string; email: string }>(token);
    return { id: payload.sub, email: payload.email };
  }
}
