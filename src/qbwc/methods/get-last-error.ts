import { validateTicket } from "../../security/session-ticket";
import { getSessionError } from "./send-request-xml";
import { logQBWCMethod } from "../../observability/logger";

export async function getLastError(args: { ticket: string }): Promise<{ getLastErrorResult: string }> {
  logQBWCMethod("getLastError", null, { ticket: args.ticket });

  const session = await validateTicket(args.ticket);
  if (!session) {
    return { getLastErrorResult: "Session not found or expired" };
  }

  const error = getSessionError(args.ticket);
  return { getLastErrorResult: error ?? "" };
}
