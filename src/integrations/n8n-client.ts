import { env } from "../config/env";
import { getPendingEvents, markEventDelivered, markEventFailed } from "../db/repositories/events";
import { logger } from "../observability/logger";

export async function deliverPendingEvents(): Promise<void> {
  if (!env.N8N_WEBHOOK_URL) {
    logger.debug("N8N_WEBHOOK_URL not configured; skipping event delivery");
    return;
  }

  const events = await getPendingEvents(100);
  for (const event of events) {
    try {
      await sendEventToN8n(event.event_type, event.payload);
      await markEventDelivered(event.id);
      logger.info("Event delivered to n8n", { eventId: event.id, eventType: event.event_type });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markEventFailed(event.id, msg);
      logger.warn("Event delivery failed", { eventId: event.id, error: msg });
    }
  }
}

export async function sendEventToN8n(eventType: string, payload: object): Promise<void> {
  if (!env.N8N_WEBHOOK_URL) {
    throw new Error("N8N_WEBHOOK_URL is not configured");
  }

  const body = {
    type: eventType,
    ...payload,
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(env.N8N_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`n8n webhook returned ${res.status}: ${await res.text()}`);
  }
}
