import { closeSession } from "../../security/session-ticket";
import { getSessionError, clearSessionError } from "./send-request-xml";
import { logQBWCMethod } from "../../observability/logger";
import { createAuditLog } from "../../db/repositories/audit";

export async function closeConnection(args: { ticket: string }): Promise<{ closeConnectionResult: string }> {
  logQBWCMethod("closeConnection", null, { ticket: args.ticket });

  clearSessionError(args.ticket);
  await closeSession(args.ticket);
  await createAuditLog({ action: "qbwc.session.ended", details: { ticket: args.ticket } });

  return { closeConnectionResult: "OK" };
}
