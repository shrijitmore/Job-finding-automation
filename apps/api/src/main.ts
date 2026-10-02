import "reflect-metadata";
import { existsSync } from "node:fs";
import path from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createDb, runMigrations } from "@jfa/db";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
import { loadConfig } from "./config";

async function bootstrap() {
  const config = loadConfig();
  if (config.MIGRATE_ON_START) {
    const { db, pool } = createDb(config.DATABASE_URL, { max: 1 });
    await runMigrations(db);
    await pool.end();
    Logger.log("Database migrations applied", "Bootstrap");
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), { bodyParser: true });
  app.enableShutdownHooks();
  configureApp(app, config);

  // Optionally serve the built web app from the same origin (simplest cookie setup).
  const webDist = process.env.WEB_DIST_DIR ? path.resolve(process.env.WEB_DIST_DIR) : null;
  if (webDist && existsSync(path.join(webDist, "index.html"))) {
    app.useStaticAssets(webDist, { index: false, maxAge: "1h" });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      res.sendFile(path.join(webDist, "index.html"));
    });
    Logger.log(`Serving web app from ${webDist}`, "Bootstrap");
  }
  await app.listen(config.PORT, "0.0.0.0");
  Logger.log(`API listening on :${config.PORT}`, "Bootstrap");
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
