import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export function requireAdminApiKey(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();

  if (!env.ADMIN_API_KEY) {
    res.status(500).json({ error: "Admin API key not configured" });
    return;
  }

  if (token !== env.ADMIN_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
