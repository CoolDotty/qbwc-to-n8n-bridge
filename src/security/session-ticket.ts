import crypto from "crypto";
import { query } from "../db/connection";

export interface SessionTicket {
  ticket: string;
  connectionId: string;
  expiresAt: Date;
}

export function generateTicket(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(connectionId: string, ttlMinutes = 60): Promise<SessionTicket> {
  const ticket = generateTicket();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await query(
    "INSERT INTO qb_sessions (connection_id, ticket, expires_at) VALUES ($1, $2, $3)",
    [connectionId, ticket, expiresAt]
  );
  return { ticket, connectionId, expiresAt };
}

export async function validateTicket(ticket: string): Promise<SessionTicket | null> {
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
