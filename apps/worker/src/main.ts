import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createDb, runMigrations } from "@jfa/db";
import { loadConfig } from "./config";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL, { max: 1 });
  await runMigrations(db);
  await pool.end();
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config));
  app.enableShutdownHooks();
  Logger.log("Worker ready", "Bootstrap");
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
