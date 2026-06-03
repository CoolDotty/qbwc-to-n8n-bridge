import fs from "fs";
import path from "path";
import { getPool } from "./connection";
import { logger } from "../observability/logger";

async function runMigrations() {
  const pool = getPool();
  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const file of files) {
    if (!file.endsWith(".sql")) continue;
    const alreadyApplied = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [file]);
    if (alreadyApplied.rows.length > 0) {
      logger.debug(`Migration already applied: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    logger.info(`Applying migration: ${file}`);
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
  }

  logger.info("Migrations complete");
}

runMigrations().catch((err) => {
  logger.error("Migration failed", { error: err.message });
  process.exit(1);
});
