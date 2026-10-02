import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import type { AppConfig } from "./config";

export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix("api");
  // Behind Vercel/Render proxies: use X-Forwarded-For for client IPs (rate limits) and protocol.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", true);
  app.use(cookieParser());
  app.enableCors({
    origin: config.WEB_ORIGIN.split(",").map((o) => o.trim()),
    credentials: true,
  });
}
