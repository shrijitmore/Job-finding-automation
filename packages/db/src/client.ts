import path from "node:path";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
}

export function createDb(connectionString: string, opts: { max?: number } = {}): DbHandle {
  const ssl = /sslmode=require|neon\.tech|supabase\.co/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined;
  const pool = new pg.Pool({ connectionString, max: opts.max ?? 10, ssl });
  return { db: drizzle(pool, { schema }), pool };
}

export const MIGRATIONS_FOLDER = path.join(__dirname, "..", "migrations");

export async function runMigrations(db: Db, folder = MIGRATIONS_FOLDER): Promise<void> {
  await migrate(db, { migrationsFolder: folder });
}
