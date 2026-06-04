import { findConnectionById } from "../../db/repositories/connections";
import { closeSession, validateTicket } from "../../security/session-ticket";
import { logQBWCMethod } from "../../observability/logger";
import { createAuditLog } from "../../db/repositories/audit";
import { env } from "../../config/env";

const DEFAULT_RETRY = "C:\\";
const MAX_RETRY_PATH_LENGTH = 255;

function safeRetryPath(raw: string | undefined): string {
  if (!raw) return DEFAULT_RETRY;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_RETRY_PATH_LENGTH) return DEFAULT_RETRY;
  if (/[\u0000-\u001f]/.test(trimmed)) return DEFAULT_RETRY;
  return trimmed;
}

export async function connectionError(args: {
  ticket: string;
  hresult?: string;
  message?: string;
}): Promise<{ connectionErrorResult: string }> {
  logQBWCMethod("connectionError", null, { ticket: args.ticket, hresult: args.hresult, message: args.message });

  const session = await validateTicket(args.ticket);
  if (session) {
    const connection = await findConnectionById(session.connectionId);
    await createAuditLog({
      connectionId: session.connectionId,
      tenantId: connection?.tenant_id,
      action: "qbwc.connection.error",
      details: { hresult: args.hresult, message: args.message },
    });
    await closeSession(args.ticket);
  }

  return { connectionErrorResult: safeRetryPath(env.QBW_DEFAULT_PATH) };
}
