import { createDb, runMigrations } from "@jfa/db";

export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/jfa_test_worker";
  const { db, pool } = createDb(url, { max: 1 });
  await runMigrations(db);
  await pool.end();
}
