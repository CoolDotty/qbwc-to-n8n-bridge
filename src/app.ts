import express from "express";
import bodyParser from "body-parser";
import helmet from "helmet";
import { env } from "./config/env";
import { getPool } from "./db/connection";
import { qbwcRateLimiter, adminRateLimiter } from "./security/rate-limit";
import { requireAdminApiKey } from "./security/api-key";
import { qbwcService, getWSDL } from "./http/soap-controller";
import adminRouter from "./http/admin-controller";
import eventsRouter from "./http/internal-events-controller";
import { logger } from "./observability/logger";
import { deliverPendingEvents } from "./integrations/n8n-client";
import { createSoapRouter } from "./qbwc/soap-router";

const app = express();

if (env.TRUST_PROXY) {
  const n = Number(env.TRUST_PROXY);
  app.set("trust proxy", Number.isFinite(n) ? n : env.TRUST_PROXY);
}

app.use(helmet());
app.use(bodyParser.json({ limit: env.MAX_BODY_SIZE }));
app.use(bodyParser.text({ type: ["text/xml", "application/xml", "application/soap+xml"], limit: env.MAX_BODY_SIZE }));

app.use("/qbwc", qbwcRateLimiter);

app.get("/health", async (_req, res) => {
  try {
    await getPool().query("SELECT 1");
    res.json({ status: "ok", env: env.NODE_ENV });
  } catch {
    res.status(503).json({ status: "error", detail: "database unreachable" });
  }
});

app.use("/api/admin", adminRateLimiter, requireAdminApiKey, adminRouter);
app.use("/api/internal", adminRateLimiter, requireAdminApiKey, eventsRouter);

const server = app.listen(env.PORT, () => {
  logger.info(`QBWC-n8n-Bridge listening on port ${env.PORT}`, { port: env.PORT, env: env.NODE_ENV });
});

const soapRouter = createSoapRouter(qbwcService as unknown as Record<string, (args: Record<string, unknown>) => Promise<unknown>>);

app.get("/qbwc", (_req, res) => {
  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  res.send(getWSDL());
});

app.post("/qbwc", async (req, res) => {
  const xml = typeof req.body === "string" ? req.body : req.body?.toString("utf-8") ?? "";
  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  const response = await soapRouter.handle(xml);
  res.send(response);
});

logger.info("SOAP service mounted at /qbwc");

const deliveryInterval = setInterval(() => {
  deliverPendingEvents().catch((err) => {
    logger.error("Background event delivery failed", { error: (err as Error).message });
  });
}, 30000);

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`);
  clearInterval(deliveryInterval);
  server.close(() => {
    getPool().end().then(() => process.exit(0));
  });
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
