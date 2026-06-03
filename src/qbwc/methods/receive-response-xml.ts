import { validateTicket } from "../../security/session-ticket";
import { findJobById, completeJob, failJob, createJobAttempt, saveRawMessage } from "../../db/repositories/jobs";
import { updateConnectionLastSuccess, updateConnectionLastError, findConnectionById } from "../../db/repositories/connections";
import { logQBWCMethod } from "../../observability/logger";
import { createOutboundEvent } from "../../db/repositories/events";
import { createAuditLog } from "../../db/repositories/audit";
import { parseQBXMLResponse } from "../qbxml/parsers/response-parser";
import { getSessionError, setSessionError, clearSessionError } from "./send-request-xml";
import { env } from "../../config/env";

const MAX_RAW_MESSAGE_BYTES = 5 * 1024 * 1024; // 5 MiB cap on persisted QBXML payloads

function capRawXml(raw: string): string {
  if (Buffer.byteLength(raw, "utf8") <= MAX_RAW_MESSAGE_BYTES) return raw;
  return `[truncated: exceeded ${MAX_RAW_MESSAGE_BYTES} bytes]\n` + raw.slice(0, 16384);
}

export async function receiveResponseXML(args: {
  ticket: string;
  response: string;
  hresult?: string;
  message?: string;
}): Promise<{ receiveResponseXMLResult: number }> {
  logQBWCMethod("receiveResponseXML", null, { ticket: args.ticket, hresult: args.hresult, message: args.message });

  const session = await validateTicket(args.ticket);
  if (!session) {
    return { receiveResponseXMLResult: -1 };
  }

  if (args.hresult) {
    setSessionError(args.ticket, `QBWC error: ${args.hresult} - ${args.message ?? ""}`);
    await updateConnectionLastError(session.connectionId, args.message);
    return { receiveResponseXMLResult: -1 };
  }

  await saveRawMessage({
    connectionId: session.connectionId,
    direction: "response",
    rawXml: capRawXml(args.response),
  });

  try {
    const parsed = await parseQBXMLResponse(args.response);
    const normalized = parsed?.entities ?? [];
    const statusCode = parsed?.statusCode ?? "0";
    const statusMessage = parsed?.statusMessage ?? "";

    if (statusCode !== "0") {
      setSessionError(args.ticket, `QuickBooks error ${statusCode}: ${statusMessage}`);
      await updateConnectionLastError(session.connectionId, statusMessage);
      await createAuditLog({
        connectionId: session.connectionId,
        action: "qb.response.received",
        details: { statusCode, statusMessage, raw: args.response.slice(0, 500) },
      });
      return { receiveResponseXMLResult: -1 };
    }

    await updateConnectionLastSuccess(session.connectionId);
    clearSessionError(args.ticket);

    const connection = await findConnectionById(session.connectionId);
    const tenantId = connection?.tenant_id ?? "";

    await createOutboundEvent({
      tenantId,
      connectionId: session.connectionId,
      eventType: "qb.response.received",
      payload: {
        connectionId: session.connectionId,
        normalizedEntities: normalized,
        rawResponse: args.response,
        timestamp: new Date().toISOString(),
      },
    });

    await createAuditLog({
      tenantId,
      connectionId: session.connectionId,
      action: "qb.response.received",
      details: { entityCount: normalized.length },
    });

    return { receiveResponseXMLResult: 100 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setSessionError(args.ticket, `Parse error: ${msg}`);
    await updateConnectionLastError(session.connectionId, msg);
    return { receiveResponseXMLResult: -1 };
  }
}
