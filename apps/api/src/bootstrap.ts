import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import type { AppConfig } from "./config";

export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.enableCors({
    origin: config.WEB_ORIGIN.split(",").map((o) => o.trim()),
    credentials: true,
  });
}
