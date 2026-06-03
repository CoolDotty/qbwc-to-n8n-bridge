import { createJob } from "../db/repositories/jobs";
import { findConnectionById } from "../db/repositories/connections";
import { logger } from "../observability/logger";
import { createAuditLog } from "../db/repositories/audit";
import { createOutboundEvent } from "../db/repositories/events";
import {
  buildCustomerQueryRq,
  buildInvoiceQueryRq,
  buildItemQueryRq,
  buildPaymentQueryRq,
} from "../qbwc/qbxml/builders/query-builder";
import { buildCustomerAddRq, buildInvoiceAddRq } from "../qbwc/qbxml/builders/add-builder";

export interface EnqueuePayload {
  connectionId: string;
  jobType: string;
  entityType: string;
  idempotencyKey?: string;
  payload?: object;
}

export async function enqueueJob(data: EnqueuePayload) {
  const connection = await findConnectionById(data.connectionId);
  if (!connection) {
    throw new Error(`Connection not found: ${data.connectionId}`);
  }

  const qbxmlRequest = buildQbxmlRequest(data.jobType, data.entityType, data.payload);

  const job = await createJob({
    tenantId: connection.tenant_id,
    connectionId: connection.id,
    jobType: data.jobType,
    entityType: data.entityType,
    direction: data.jobType.endsWith(".query") ? "inbound" : "outbound",
    idempotencyKey: data.idempotencyKey,
    qbxmlRequest,
    normalizedPayload: data.payload,
  });

  logger.info("Job enqueued", {
    jobId: job.id,
    connectionId: connection.id,
    jobType: data.jobType,
    entityType: data.entityType,
  });

  await createAuditLog({
    tenantId: connection.tenant_id,
    connectionId: connection.id,
    action: "qb.job.enqueued",
    details: { jobId: job.id, jobType: data.jobType },
  });

  await createOutboundEvent({
    tenantId: connection.tenant_id,
    connectionId: connection.id,
    eventType: "qb.job.enqueued",
    payload: {
      jobId: job.id,
      jobType: data.jobType,
      entityType: data.entityType,
      status: job.status,
      createdAt: job.created_at,
    },
  });

  return job;
}

function buildQbxmlRequest(jobType: string, entityType: string, payload?: object): string | undefined {
  if (jobType.endsWith(".query")) {
    switch (entityType.toLowerCase()) {
      case "customer":
        return buildCustomerQueryRq();
      case "invoice":
        return buildInvoiceQueryRq();
      case "item":
        return buildItemQueryRq();
      case "payment":
        return buildPaymentQueryRq();
      default:
        return undefined;
    }
  }

  if (jobType.endsWith(".add")) {
    switch (entityType.toLowerCase()) {
      case "customer": {
        const p = payload as { name: string; firstName?: string; lastName?: string; email?: string; phone?: string };
        return buildCustomerAddRq(p);
      }
      case "invoice": {
        const p = payload as { customerRef: string; txnDate: string; lines: { itemRef: string; quantity: number; rate: number; description?: string }[] };
        return buildInvoiceAddRq(p);
      }
      default:
        return undefined;
    }
  }

  return undefined;
}
