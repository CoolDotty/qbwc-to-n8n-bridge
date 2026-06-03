import { query } from "../connection";

export interface OutboundEvent {
  id: string;
  tenant_id: string;
  connection_id: string;
  event_type: string;
  payload: object;
  delivery_status: string;
  attempt_count: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createOutboundEvent(data: {
  tenantId: string;
  connectionId: string;
  eventType: string;
  payload: object;
}): Promise<OutboundEvent> {
  const rows = await query<OutboundEvent>(
    `INSERT INTO outbound_events (tenant_id, connection_id, event_type, payload)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [data.tenantId, data.connectionId, data.eventType, JSON.stringify(data.payload)]
  );
  return rows[0];
}

export async function markEventDelivered(eventId: string): Promise<void> {
  await query(
    "UPDATE outbound_events SET delivery_status = 'delivered', updated_at = NOW() WHERE id = $1",
    [eventId]
  );
}

export async function markEventFailed(eventId: string, error: string): Promise<void> {
  await query(
    "UPDATE outbound_events SET delivery_status = 'failed', last_error = $2, attempt_count = attempt_count + 1, updated_at = NOW() WHERE id = $1",
    [eventId, error]
  );
}

export async function getPendingEvents(limit = 100): Promise<OutboundEvent[]> {
  return query<OutboundEvent>(
    "SELECT * FROM outbound_events WHERE delivery_status = 'pending' ORDER BY created_at ASC LIMIT $1",
    [limit]
  );
}
