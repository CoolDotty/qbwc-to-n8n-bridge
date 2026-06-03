import { validateTicket } from "../../security/session-ticket";
import { leaseNextJob, markJobSent, createJobAttempt, saveRawMessage } from "../../db/repositories/jobs";
import { updateConnectionClientVersion, updateConnectionLastSuccess, findConnectionById } from "../../db/repositories/connections";
import { logQBWCMethod } from "../../observability/logger";
import { env } from "../../config/env";

const MAX_SESSION_ERROR_ENTRIES = 1000;
const sessionErrors = new Map<string, string>();

function trimSessionErrors(): void {
  while (sessionErrors.size > MAX_SESSION_ERROR_ENTRIES) {
    const oldest = sessionErrors.keys().next().value;
    if (oldest === undefined) break;
    sessionErrors.delete(oldest);
  }
}

export function setSessionError(ticket: string, message: string): void {
  sessionErrors.set(ticket, message.slice(0, 2000));
  trimSessionErrors();
}

export function getSessionError(ticket: string): string | undefined {
  return sessionErrors.get(ticket);
}

export function clearSessionError(ticket: string): void {
  sessionErrors.delete(ticket);
}

export async function sendRequestXML(args: {
  ticket: string;
  strHCPResponse?: string;
  strCompanyFileName?: string;
  qbXMLCountry?: string;
  qbXMLMajorVers?: string;
  qbXMLMinorVers?: string;
}): Promise<{ sendRequestXMLResult: string }> {
  logQBWCMethod("sendRequestXML", null, { ticket: args.ticket });

  const session = await validateTicket(args.ticket);
  if (!session) {
    return { sendRequestXMLResult: "" };
  }

  if (args.qbXMLMajorVers || args.qbXMLMinorVers) {
    const version = `${args.qbXMLMajorVers ?? "?"}.${args.qbXMLMinorVers ?? "?"}`;
    await updateConnectionClientVersion(session.connectionId, version);
  }

  const job = await leaseNextJob(session.connectionId);
  if (!job) {
    await updateConnectionLastSuccess(session.connectionId);
    return { sendRequestXMLResult: "NoOp" };
  }

  if (!job.qbxml_request) {
    setSessionError(args.ticket, `Job ${job.id} has no qbXML request`);
    return { sendRequestXMLResult: "" };
  }

  const connection = await findConnectionById(session.connectionId);
  const isWrite = job.direction === "outbound";
  if (isWrite && (connection?.is_read_only || env.READ_ONLY)) {
    setSessionError(args.ticket, "Write operations are disabled in read-only mode");
    return { sendRequestXMLResult: "" };
  }

  await markJobSent(job.id);
  await createJobAttempt({
    jobId: job.id,
    attemptNumber: job.attempt_count + 1,
    status: "sent",
    requestXml: job.qbxml_request,
  });
  await saveRawMessage({
    jobId: job.id,
    connectionId: session.connectionId,
    direction: "request",
    rawXml: job.qbxml_request.slice(0, 5 * 1024 * 1024),
  });

  logQBWCMethod("sendRequestXML_dispatch", session.connectionId, { jobId: job.id, entityType: job.entity_type });

  return { sendRequestXMLResult: job.qbxml_request };
}
