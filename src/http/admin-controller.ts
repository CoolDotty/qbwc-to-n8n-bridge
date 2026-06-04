import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { hashPassword } from "../security/password";
import { generateQWC } from "../qbwc/qwc-generator";
import { createConnection, findConnectionById, listConnections } from "../db/repositories/connections";
import { createJob } from "../db/repositories/jobs";
import { createAuditLog } from "../db/repositories/audit";
import { enqueueJob } from "../queue/enqueue-job";
import { env, isValidQBType } from "../config/env";
import { logger } from "../observability/logger";

const router = Router();

const VALID_AUTH_FLAGS = /^(0x[0-9A-Fa-f]+|\d+)$/;

router.post("/connections", async (req, res) => {
  try {
    const { tenantId, displayName, username, password, qbType, isReadOnly, pollMinutes, authFlags } = req.body;
    if (!tenantId || !displayName || !username || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (qbType !== undefined && !isValidQBType(qbType)) {
      return res.status(400).json({ error: "qbType must be 'QBFS' or 'QBPOS'" });
    }
    if (pollMinutes !== undefined && (!Number.isInteger(pollMinutes) || pollMinutes < 1 || pollMinutes > 1440)) {
      return res.status(400).json({ error: "pollMinutes must be an integer between 1 and 1440" });
    }
    if (authFlags !== undefined && !VALID_AUTH_FLAGS.test(String(authFlags))) {
      return res.status(400).json({ error: "authFlags must be a hex or decimal integer string" });
    }

    const passwordHash = await hashPassword(password);
    const connection = await createConnection({
      tenantId,
      displayName,
      username,
      passwordHash,
      qbType: qbType ?? "QBFS",
      isReadOnly: isReadOnly ?? false,
      pollMinutes: pollMinutes ?? 30,
      authFlags: authFlags ?? env.QWC_AUTH_FLAGS,
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
      authFlags: c.auth_flags,
      status: c.status,
      lastSuccessAt: c.last_success_at,
      lastErrorAt: c.last_error_at,
      lastCompanyFileName: c.last_company_file_name,
      lastQbCountry: c.last_qb_country,
      lastQbxmlMajorVers: c.last_qbxml_major_vers,
      lastQbxmlMinorVers: c.last_qbxml_minor_vers,
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
      qbType: connection.qb_type as "QBFS" | "QBPOS",
      isReadOnly: connection.is_read_only,
      authFlags: connection.auth_flags,
      scheduler: { runEveryNMinutes: connection.poll_minutes },
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
