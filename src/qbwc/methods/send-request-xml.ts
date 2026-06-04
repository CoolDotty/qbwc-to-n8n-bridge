import { validateTicket } from "../../security/session-ticket";
import { leaseNextJob, markJobSent, createJobAttempt, saveRawMessage } from "../../db/repositories/jobs";
import {
  updateConnectionClientVersion,
  updateConnectionLastSuccess,
  findConnectionById,
  updateConnectionSessionMetadata,
} from "../../db/repositories/connections";
import { logQBWCMethod } from "../../observability/logger";
import { env } from "../../config/env";
import { parseHCPResponse } from "../qbxml/parsers/hcp-parser";
import { createAuditLog } from "../../db/repositories/audit";

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

const HCP_SEEN = new Set<string>();

export async function sendRequestXML(args: {
  ticket: string;
  strHCPResponse?: string;
  strCompanyFileName?: string;
  qbXMLCountry?: string;
  qbXMLMajorVers?: string | number;
  qbXMLMinorVers?: string | number;
}): Promise<{ sendRequestXMLResult: string }> {
  logQBWCMethod("sendRequestXML", null, { ticket: args.ticket });

  const session = await validateTicket(args.ticket);
  if (!session) {
    return { sendRequestXMLResult: "" };
  }

  const major = args.qbXMLMajorVers === undefined || args.qbXMLMajorVers === "" ? null : Number(args.qbXMLMajorVers);
  const minor = args.qbXMLMinorVers === undefined || args.qbXMLMinorVers === "" ? null : Number(args.qbXMLMinorVers);

  let hcpFileID: string | null = null;
  if (args.strHCPResponse && !HCP_SEEN.has(session.connectionId)) {
    HCP_SEEN.add(session.connectionId);
    try {
      const parsed = await parseHCPResponse(args.strHCPResponse);
      hcpFileID = parsed.fileID;
    } catch (err) {
      logQBWCMethod("sendRequestXML_hcp_parse_error", session.connectionId, { error: (err as Error).message });
    }
  }

  await updateConnectionSessionMetadata(session.connectionId, {
    companyFileName: args.strCompanyFileName,
    qbXMLCountry: args.qbXMLCountry,
    qbXMLMajorVers: Number.isFinite(major) ? (major as number) : undefined,
    qbXMLMinorVers: Number.isFinite(minor) ? (minor as number) : undefined,
    fileIDFromHCP: hcpFileID ?? undefined,
  });

  if (hcpFileID) {
    const connection = await findConnectionById(session.connectionId);
    if (connection && connection.file_id !== hcpFileID) {
      logQBWCMethod("sendRequestXML_file_id_mismatch", session.connectionId, {
        expected: connection.file_id,
        actual: hcpFileID,
        companyFile: args.strCompanyFileName,
      });
      await createAuditLog({
        connectionId: session.connectionId,
        tenantId: connection.tenant_id,
        action: "qbwc.file_id.mismatch",
        details: {
          expectedFileID: connection.file_id,
          actualFileID: hcpFileID,
          companyFile: args.strCompanyFileName,
        },
      });
    }
  }

  if (major !== null || minor !== null) {
    const version = `${major ?? "?"}.${minor ?? "?"}`;
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
