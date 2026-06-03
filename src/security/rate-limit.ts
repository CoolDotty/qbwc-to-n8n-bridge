import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import { logger } from "../observability/logger";

export const qbwcRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn("Rate limit exceeded", { ip: req.ip, path: req.path });
    res.status(429).json({ error: "Too many requests" });
  },
});
