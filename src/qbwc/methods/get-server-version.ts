import { env } from "../../config/env";
import { logQBWCMethod } from "../../observability/logger";

export function getServerVersion(_args: { ticket?: string } = {}): { getServerVersionResult: string } {
  logQBWCMethod("getServerVersion", null, {});
  const version = env.SERVER_VERSION ?? "QBWC-n8n-Bridge/1.0";
  return { getServerVersionResult: version };
}
