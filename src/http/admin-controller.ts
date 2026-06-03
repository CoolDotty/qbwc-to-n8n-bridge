import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { hashPassword } from "../security/password";
import { generateQWC } from "../qbwc/qwc-generator";
import { createConnection, findConnectionById, listConnections } from "../db/repositories/connections";
import { createJob } from "../db/repositories/jobs";
import { createAuditLog } from "../db/repositories/audit";
import { enqueueJob } from "../queue/enqueue-job";
import { env } from "../config/env";
import { logger } from "../observability/logger";

const router = Router();

router.post("/connections", async (req, res) => {
  try {
    const { tenantId, displayName, username, password, qbType, isReadOnly, pollMinutes } = req.body;
    if (!tenantId || !displayName || !username || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const passwordHash = await hashPassword(password);
    const connection = await createConnection({
      tenantId,
      displayName,
      username,
      passwordHash,
      qbType: qbType ?? "US",
      isReadOnly: isReadOnly ?? false,
      pollMinutes: pollMinutes ?? 30,
    });

    await createAuditLog({
      tenantId: connection.tenant_id,
      connectionId: connection.id,
      action: "admin.connection.created",
      details: { username },
    });

    res.status(201).json({
      id: connection.id,
      tenantId: connection.tenant_id,
      displayName: connection.display_name,
      username: connection.username,
      ownerId: connection.owner_id,
      fileId: connection.file_id,
      qbType: connection.qb_type,
      isReadOnly: connection.is_read_only,
      pollMinutes: connection.poll_minutes,
      status: connection.status,
      createdAt: connection.created_at,
    });
  } catch (err) {
    logger.error("Failed to create connection", { error: (err as Error).message });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/connections", async (req, res) => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    const connections = await listConnections(tenantId);
    res.json(connections.map((c) => ({
      id: c.id,
      tenantId: c.tenant_id,
      displayName: c.display_name,
      username: c.username,
      ownerId: c.owner_id,
      fileId: c.file_id,
      qbType: c.qb_type,
      isReadOnly: c.is_read_only,
      pollMinutes: c.poll_minutes,
      status: c.status,
      lastSuccessAt: c.last_success_at,
      lastErrorAt: c.last_error_at,
      createdAt: c.created_at,
    })));
  } catch (err) {
    logger.error("Failed to list connections", { error: (err as Error).message });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/connections/:id/qwc", async (req, res) => {
  try {
    const connection = await findConnectionById(req.params.id);
    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    const qwc = generateQWC({
      appName: connection.display_name,
      appURL: `${env.PUBLIC_URL}/qbwc`,
      appSupport: `${env.PUBLIC_URL}/qbwc`,
      username: connection.username,
      ownerID: connection.owner_id,
      fileID: connection.file_id,
      qbType: connection.qb_type,
    });

    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Content-Disposition", `attachment; filename="${connection.display_name.replace(/\s+/g, "_")}.qwc"`);
    res.send(qwc);
  } catch (err) {
    logger.error("Failed to generate qwc", { error: (err as Error).message });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/connections/:id/jobs", async (req, res) => {
  try {
    const connection = await findConnectionById(req.params.id);
    if (!connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    const { jobType, entityType, idempotencyKey, payload } = req.body;
    if (!jobType || !entityType) {
      return res.status(400).json({ error: "Missing jobType or entityType" });
    }

    const job = await enqueueJob({ connectionId: connection.id, jobType, entityType, idempotencyKey, payload });
    res.status(201).json({
      id: job.id,
      status: job.status,
      jobType: job.job_type,
      entityType: job.entity_type,
      direction: job.direction,
      createdAt: job.created_at,
    });
  } catch (err) {
    logger.error("Failed to enqueue job", { error: (err as Error).message });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
