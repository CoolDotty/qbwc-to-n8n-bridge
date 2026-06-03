import crypto from "crypto";
import { env } from "../config/env";
import { query } from "../db/connection";

export interface SessionTicket {
  ticket: string;
  connectionId: string;
  expiresAt: Date;
}

const TICKET_BYTES = 24;
const SEPARATOR = ".";

function getSecret(): string {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is not configured");
  return env.SESSION_SECRET;
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export function generateTicket(): string {
  return crypto.randomBytes(TICKET_BYTES).toString("hex");
}

export function sealTicket(rawTicket: string): string {
  const sig = sign(rawTicket, getSecret());
  return `${rawTicket}${SEPARATOR}${sig}`;
}

export function unsealTicket(sealed: string): string | null {
  const idx = sealed.lastIndexOf(SEPARATOR);
  if (idx <= 0) return null;
  const raw = sealed.slice(0, idx);
  const provided = sealed.slice(idx + 1);
  const expected = sign(raw, getSecret());
  if (!timingSafeEqualHex(provided, expected)) return null;
  return raw;
}

export async function createSession(connectionId: string, ttlMinutes = 60): Promise<SessionTicket> {
  const rawTicket = generateTicket();
  const ticket = sealTicket(rawTicket);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await query(
    "INSERT INTO qb_sessions (connection_id, ticket, expires_at) VALUES ($1, $2, $3)",
    [connectionId, ticket, expiresAt]
  );
  return { ticket, connectionId, expiresAt };
}

export async function validateTicket(ticket: string): Promise<SessionTicket | null> {
  if (ticket.includes(SEPARATOR)) {
    const raw = unsealTicket(ticket);
    if (!raw) return null;
  }
  const rows = await query<{ connection_id: string; expires_at: Date }>(
    "SELECT connection_id, expires_at FROM qb_sessions WHERE ticket = $1 AND expires_at > NOW()",
    [ticket]
  );
  if (rows.length === 0) return null;
  return {
    ticket,
    connectionId: rows[0].connection_id,
    expiresAt: rows[0].expires_at,
  };
}

export async function closeSession(ticket: string): Promise<void> {
  await query("DELETE FROM qb_sessions WHERE ticket = $1", [ticket]);
}

export async function cleanupExpiredSessions(): Promise<void> {
  await query("DELETE FROM qb_sessions WHERE expires_at <= NOW()");
}
