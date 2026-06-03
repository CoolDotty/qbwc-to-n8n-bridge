import { query } from "../connection";

export interface QBJob {
  id: string;
  tenant_id: string;
  connection_id: string;
  job_type: string;
  entity_type: string;
  direction: string;
  idempotency_key: string | null;
  status: string;
  priority: number;
  qbxml_request: string | null;
  normalized_payload: object | null;
  leased_until: Date | null;
  attempt_count: number;
  created_at: Date;
  updated_at: Date;
}

export async function createJob(data: {
  tenantId: string;
  connectionId: string;
  jobType: string;
  entityType: string;
  direction: "inbound" | "outbound";
  idempotencyKey?: string;
  priority?: number;
  qbxmlRequest?: string;
  normalizedPayload?: object;
}): Promise<QBJob> {
  const rows = await query<QBJob>(
    `INSERT INTO qb_jobs
     (tenant_id, connection_id, job_type, entity_type, direction, idempotency_key, priority, qbxml_request, normalized_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      data.tenantId,
      data.connectionId,
      data.jobType,
      data.entityType,
      data.direction,
      data.idempotencyKey ?? null,
      data.priority ?? 0,
      data.qbxmlRequest ?? null,
      data.normalizedPayload ? JSON.stringify(data.normalizedPayload) : null,
    ]
  );
  return rows[0];
}

export async function leaseNextJob(connectionId: string, leaseMinutes = 5): Promise<QBJob | null> {
  const rows = await query<QBJob>(
    `UPDATE qb_jobs
     SET status = 'leased', leased_until = NOW() + INTERVAL '${leaseMinutes} minutes', attempt_count = attempt_count + 1, updated_at = NOW()
     WHERE id = (
       SELECT id FROM qb_jobs
       WHERE connection_id = $1 AND status = 'pending'
       ORDER BY priority DESC, created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`,
    [connectionId]
  );
  return rows[0] ?? null;
}

export async function markJobSent(jobId: string): Promise<void> {
  await query("UPDATE qb_jobs SET status = 'sent', updated_at = NOW() WHERE id = $1", [jobId]);
}

export async function completeJob(jobId: string): Promise<void> {
  await query("UPDATE qb_jobs SET status = 'succeeded', updated_at = NOW() WHERE id = $1", [jobId]);
}

export async function failJob(jobId: string, maxAttempts = 3): Promise<void> {
  await query(
    `UPDATE qb_jobs
     SET status = CASE WHEN attempt_count >= $2 THEN 'dead_letter' ELSE 'pending' END,
         leased_until = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, maxAttempts]
  );
}

export async function findJobById(id: string): Promise<QBJob | null> {
  const rows = await query<QBJob>("SELECT * FROM qb_jobs WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createJobAttempt(data: {
  jobId: string;
  attemptNumber: number;
  status: string;
  requestXml?: string;
  responseXml?: string;
  errorMessage?: string;
}): Promise<void> {
  await query(
    `INSERT INTO qb_job_attempts (job_id, attempt_number, status, request_xml, response_xml, error_message)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      data.jobId,
      data.attemptNumber,
      data.status,
      data.requestXml ?? null,
      data.responseXml ?? null,
      data.errorMessage ?? null,
    ]
  );
}

export async function saveRawMessage(data: {
  jobId?: string;
  connectionId: string;
  direction: "request" | "response";
  rawXml: string;
}): Promise<void> {
  await query(
    `INSERT INTO qb_raw_messages (job_id, connection_id, direction, raw_xml)
     VALUES ($1,$2,$3,$4)`,
    [data.jobId ?? null, data.connectionId, data.direction, data.rawXml]
  );
}
