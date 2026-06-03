import winston from "winston";
import { env } from "../config/env";

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    env.NODE_ENV === "production"
      ? winston.format.json()
      : winston.format.printf(({ level, message, timestamp, ...meta }) => {
          return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""}`;
        })
  ),
  transports: [new winston.transports.Console()],
  defaultMeta: { service: "qbwc-n8n-bridge" },
});

export function logQBWCMethod(method: string, connectionId: string | null, meta: Record<string, unknown> = {}) {
  logger.info(`QBWC method: ${method}`, { method, connectionId, ...meta });
}

export function logAuthFailure(username: string, reason: string, meta: Record<string, unknown> = {}) {
  logger.warn(`QBWC auth failure: ${reason}`, { username, reason, ...meta });
}
