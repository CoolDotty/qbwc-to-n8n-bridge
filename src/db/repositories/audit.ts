import { query } from "../connection";

export async function createAuditLog(data: {
  tenantId?: string;
  connectionId?: string;
  action: string;
  actor?: string;
  details?: object;
}): Promise<void> {
  await query(
    `INSERT INTO audit_logs (tenant_id, connection_id, action, actor, details)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      data.tenantId ?? null,
      data.connectionId ?? null,
      data.action,
      data.actor ?? null,
      data.details ? JSON.stringify(data.details) : null,
    ]
  );
}
