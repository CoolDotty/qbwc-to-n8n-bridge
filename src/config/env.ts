import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().transform(Number).default("3000"),
  PUBLIC_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  N8N_WEBHOOK_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32),
  BCRYPT_ROUNDS: z.string().transform(Number).default("12"),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default("900000"),
  RATE_LIMIT_MAX: z.string().transform(Number).default("100"),
  MAX_BODY_SIZE: z.string().default("1mb"),
  READ_ONLY: z.string().transform((v) => v === "true").default("false"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  ADMIN_API_KEY: z.string().min(16),
  TRUST_PROXY: z.string().optional(),
  ADMIN_RATE_LIMIT_MAX: z.string().transform(Number).default("30"),
  QWC_AUTH_FLAGS: z.string().default("0xF"),
  AUTH_POSTPONE_SECONDS: z.string().transform(Number).default("0"),
  AUTH_MIN_RUN_EVERY_N_SECONDS: z.string().transform(Number).default("0"),
  SERVER_VERSION: z.string().default("QBWC-n8n-Bridge/1.0"),
  QBW_DEFAULT_PATH: z.string().optional(),
});

export const QB_TYPE_VALUES = ["QBFS", "QBPOS"] as const;
export type QBType = (typeof QB_TYPE_VALUES)[number];

export function isValidQBType(value: unknown): value is QBType {
  return typeof value === "string" && (QB_TYPE_VALUES as readonly string[]).includes(value);
}

export const env = envSchema.parse(process.env);
