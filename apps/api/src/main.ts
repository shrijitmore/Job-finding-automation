import "reflect-metadata";
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
  const app = await NestFactory.create(AppModule.forRoot(config), { bodyParser: true });
  app.enableShutdownHooks();
  configureApp(app, config);
  await app.listen(config.PORT, "0.0.0.0");
  Logger.log(`API listening on :${config.PORT}`, "Bootstrap");
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
