import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().transform(Number).default("3000"),
  PUBLIC_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  N8N_WEBHOOK_URL: z.string().url().optional(),
  N8N_WEBHOOK_SECRET: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32),
  BCRYPT_ROUNDS: z.string().transform(Number).default("12"),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default("900000"),
  RATE_LIMIT_MAX: z.string().transform(Number).default("100"),
  MAX_BODY_SIZE: z.string().default("1mb"),
  READ_ONLY: z.string().transform((v) => v === "true").default("false"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

export const env = envSchema.parse(process.env);
