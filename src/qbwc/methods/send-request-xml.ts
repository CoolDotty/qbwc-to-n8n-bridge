import { validateTicket } from "../../security/session-ticket";
import { leaseNextJob, markJobSent, createJobAttempt, saveRawMessage } from "../../db/repositories/jobs";
import { updateConnectionClientVersion, updateConnectionLastSuccess } from "../../db/repositories/connections";
import { logQBWCMethod } from "../../observability/logger";

const sessionErrors = new Map<string, string>();

export function setSessionError(ticket: string, message: string): void {
  sessionErrors.set(ticket, message);
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
    rawXml: job.qbxml_request,
  });

  logQBWCMethod("sendRequestXML_dispatch", session.connectionId, { jobId: job.id, entityType: job.entity_type });

  return { sendRequestXMLResult: job.qbxml_request };
}
