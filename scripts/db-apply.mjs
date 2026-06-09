// Wait for local Postgres (published on 127.0.0.1:54322), then apply the migration.
// Bypasses the Docker CLI by connecting over the published TCP port.
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(resolve(ROOT, "supabase/migrations/0001_init.sql"), "utf8");
const cfg = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

async function connectWithRetry(maxMs = 900000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const c = new pg.Client(cfg);
    try {
      await c.connect();
      return c;
    } catch {
      await c.end().catch(() => {});
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("Postgres never became reachable on 54322");
}

const c = await connectWithRetry();
console.log("\nDB connected. Applying migration...");
await c.query(sql);
const { rows } = await c.query(
  "select table_name from information_schema.tables where table_schema='public' order by table_name",
);
console.log("Public tables:", rows.map((r) => r.table_name).join(", "));
await c.end();
console.log("MIGRATION_APPLIED");
