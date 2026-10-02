// Recreates the e2e database so every run starts from a fresh install.
// Runs before the API web server starts (Playwright starts web servers before globalSetup).
import pg from "pg";

const url = new URL(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/jfa_e2e");
const dbName = url.pathname.slice(1);
url.pathname = "/postgres";
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
await client.query(`CREATE DATABASE "${dbName}"`);
await client.end();
