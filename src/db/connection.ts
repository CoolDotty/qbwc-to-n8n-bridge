import { Pool, PoolConfig } from "pg";
import { env } from "../config/env";
import { logger } from "../observability/logger";

let pool: Pool | null = null;

function buildPoolConfig(): PoolConfig {
  const url = new URL(env.DATABASE_URL);
  const sslMode = url.searchParams.get("sslmode");
  const config: PoolConfig = {
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  if (sslMode && sslMode !== "disable" && sslMode !== "allow") {
    if (env.NODE_ENV === "production" && (sslMode === "no-verify" || sslMode === "prefer")) {
      throw new Error(`Insecure sslmode '${sslMode}' is not allowed in production`);
    }
    config.ssl = {
      rejectUnauthorized: sslMode !== "no-verify",
    };
    url.searchParams.delete("sslmode");
    config.connectionString = url.toString();
  }
  return config;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(buildPoolConfig());
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
