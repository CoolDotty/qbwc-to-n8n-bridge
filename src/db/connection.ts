import { Pool, PoolConfig } from "pg";
import { env } from "../config/env";
import { logger } from "../observability/logger";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const config: PoolConfig = {
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
    pool = new Pool(config);
    pool.on("error", (err) => {
      logger.error("Unexpected database pool error", { error: err.message });
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const client = getPool();
  const result = await client.query(text, params);
  return result.rows as T[];
}
