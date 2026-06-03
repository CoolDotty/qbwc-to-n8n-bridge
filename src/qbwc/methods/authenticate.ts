import { findConnectionByUsername } from "../../db/repositories/connections";
import { verifyPassword } from "../../security/password";
import { createSession } from "../../security/session-ticket";
import { logQBWCMethod, logAuthFailure } from "../../observability/logger";
import { createAuditLog } from "../../db/repositories/audit";

export async function authenticate(args: { strUserName: string; strPassword: string }): Promise<{ authenticateResult: string[] }> {
  logQBWCMethod("authenticate", null, { username: args.strUserName });

  const connection = await findConnectionByUsername(args.strUserName);
  if (!connection) {
    logAuthFailure(args.strUserName, "unknown_username");
    await createAuditLog({ action: "qbwc.auth.failed", actor: args.strUserName, details: { reason: "unknown_username" } });
    return { authenticateResult: ["", "nvu"] };
  }

  if (connection.status !== "active") {
    logAuthFailure(args.strUserName, "connection_inactive", { connectionId: connection.id });
    await createAuditLog({ connectionId: connection.id, action: "qbwc.auth.failed", actor: args.strUserName, details: { reason: "connection_inactive" } });
    return { authenticateResult: ["", "nvu"] };
  }

  const valid = await verifyPassword(args.strPassword, connection.password_hash);
  if (!valid) {
    logAuthFailure(args.strUserName, "invalid_password", { connectionId: connection.id });
    await createAuditLog({ connectionId: connection.id, action: "qbwc.auth.failed", actor: args.strUserName, details: { reason: "invalid_password" } });
    return { authenticateResult: ["", "nvu"] };
  }

  const session = await createSession(connection.id, 60);
  logQBWCMethod("authenticate_success", connection.id, { ticket: session.ticket });
  await createAuditLog({ connectionId: connection.id, tenantId: connection.tenant_id, action: "qbwc.session.started", actor: args.strUserName, details: { ticket: session.ticket } });

  return { authenticateResult: [session.ticket, ""] };
}
