import { Router } from "express";
import { deliverPendingEvents } from "../integrations/n8n-client";
import { getPendingEvents } from "../db/repositories/events";
import { verifySignature } from "../security/hmac";
import { logger } from "../observability/logger";

const router = Router();

router.post("/events/deliver", async (req, res) => {
  try {
    await deliverPendingEvents();
    res.json({ status: "ok" });
  } catch (err) {
    logger.error("Failed to deliver events", { error: (err as Error).message });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/events/pending", async (req, res) => {
  try {
    const events = await getPendingEvents(100);
    res.json(events.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      payload: e.payload,
      attemptCount: e.attempt_count,
      createdAt: e.created_at,
    })));
  } catch (err) {
    logger.error("Failed to list pending events", { error: (err as Error).message });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/webhook/ingest", async (req, res) => {
  try {
    const signature = req.headers["x-qbwc-signature"] as string;
    if (!signature || !verifySignature(req.body, signature)) {
      return res.status(401).json({ error: "Invalid signature" });
    }
    logger.info("Ingested signed webhook", { eventType: req.body.type });
    res.json({ status: "received" });
  } catch (err) {
    logger.error("Webhook ingest failed", { error: (err as Error).message });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
