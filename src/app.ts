import express from "express";
import bodyParser from "body-parser";
import helmet from "helmet";
import * as soap from "soap";
import { env } from "./config/env";
import { getPool } from "./db/connection";
import { qbwcRateLimiter } from "./security/rate-limit";
import { qbwcService, getWSDL } from "./http/soap-controller";
import adminRouter from "./http/admin-controller";
import eventsRouter from "./http/internal-events-controller";
import { logger } from "./observability/logger";
import { deliverPendingEvents } from "./integrations/n8n-client";

const app = express();

app.use(helmet());
app.use(bodyParser.json({ limit: env.MAX_BODY_SIZE }));
app.use(bodyParser.raw({ type: "application/xml", limit: env.MAX_BODY_SIZE }));
app.use(bodyParser.text({ type: "text/xml", limit: env.MAX_BODY_SIZE }));

app.use("/qbwc", qbwcRateLimiter);

app.get("/health", async (_req, res) => {
  try {
    await getPool().query("SELECT 1");
    res.json({ status: "ok", env: env.NODE_ENV });
  } catch {
    res.status(503).json({ status: "error", detail: "database unreachable" });
  }
});

app.use("/api/admin", adminRouter);
app.use("/api/internal", eventsRouter);

const server = app.listen(env.PORT, () => {
  logger.info(`QBWC-n8n-Bridge listening on port ${env.PORT}`, { port: env.PORT, env: env.NODE_ENV });
});

const wsdl = getWSDL();
soap.listen(app as any, "/qbwc", qbwcService as any, wsdl);
logger.info("SOAP service mounted at /qbwc");

setInterval(() => {
  deliverPendingEvents().catch((err) => {
    logger.error("Background event delivery failed", { error: (err as Error).message });
  });
}, 30000);

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    getPool().end().then(() => process.exit(0));
  });
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(() => {
    getPool().end().then(() => process.exit(0));
  });
});
