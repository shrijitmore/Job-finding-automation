import "reflect-metadata";
import { createServer } from "node:http";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createDb, runMigrations } from "@jfa/db";
import { loadConfig } from "./config";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  const config = loadConfig();
  if (process.env.MIGRATE_ON_START !== "false") {
    const { db, pool } = createDb(config.DATABASE_URL, { max: 1 });
    await runMigrations(db);
    await pool.end();
  }
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config));
  app.enableShutdownHooks();
  // Optional health endpoint for hosts that expect an open port.
  const port = Number(process.env.HEALTH_PORT ?? process.env.PORT ?? 0);
  if (port) createServer((_req, res) => res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}')).listen(port, "0.0.0.0");
  Logger.log("Worker ready", "Bootstrap");
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
