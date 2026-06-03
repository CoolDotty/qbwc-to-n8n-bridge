import crypto from "crypto";
import { env } from "../config/env";

export function signPayload(payload: object, secret = env.N8N_WEBHOOK_SECRET): string {
  if (!secret) throw new Error("N8N_WEBHOOK_SECRET is not configured");
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest("hex");
}

export function verifySignature(payload: object, signature: string, secret = env.N8N_WEBHOOK_SECRET): boolean {
  if (!secret) return false;
  try {
    const expected = signPayload(payload, secret);
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
