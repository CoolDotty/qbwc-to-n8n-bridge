import { query } from "../connection";

export interface QBConnection {
  id: string;
  tenant_id: string;
  display_name: string;
  username: string;
  password_hash: string;
  owner_id: string;
  file_id: string;
  qb_type: string;
  is_read_only: boolean;
  poll_minutes: number;
  auth_flags: string;
  status: string;
  last_success_at: Date | null;
  last_error_at: Date | null;
  last_company_file_hint: string | null;
  last_company_file_name: string | null;
  last_qb_country: string | null;
  last_qbxml_major_vers: number | null;
  last_qbxml_minor_vers: number | null;
  last_seen_file_id: string | null;
  last_seen_at: Date | null;
  last_seen_client_version: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function findConnectionByUsername(username: string): Promise<QBConnection | null> {
  const rows = await query<QBConnection>("SELECT * FROM qb_connections WHERE username = $1", [username]);
  return rows[0] ?? null;
}

export async function findConnectionById(id: string): Promise<QBConnection | null> {
  const rows = await query<QBConnection>("SELECT * FROM qb_connections WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createConnection(data: {
  tenantId: string;
  displayName: string;
  username: string;
  passwordHash: string;
  ownerId?: string;
  fileId?: string;
  qbType?: string;
  isReadOnly?: boolean;
  pollMinutes?: number;
  authFlags?: string;
}): Promise<QBConnection> {
  const rows = await query<QBConnection>(
    `INSERT INTO qb_connections
     (tenant_id, display_name, username, password_hash, owner_id, file_id, qb_type, is_read_only, poll_minutes, auth_flags)
     VALUES ($1,$2,$3,$4,COALESCE($5,uuid_generate_v4()),COALESCE($6,uuid_generate_v4()),$7,$8,$9,$10)
     RETURNING *`,
    [
      data.tenantId,
      data.displayName,
      data.username,
      data.passwordHash,
      data.ownerId ?? null,
      data.fileId ?? null,
      data.qbType ?? "QBFS",
      data.isReadOnly ?? false,
      data.pollMinutes ?? 30,
      data.authFlags ?? "0xF",
    ]
  );
  return rows[0];
}

export async function updateConnectionLastSuccess(id: string): Promise<void> {
  await query("UPDATE qb_connections SET last_success_at = NOW(), updated_at = NOW() WHERE id = $1", [id]);
}

export async function updateConnectionLastError(id: string, errorHint?: string): Promise<void> {
  await query(
    "UPDATE qb_connections SET last_error_at = NOW(), last_company_file_hint = COALESCE($2,last_company_file_hint), updated_at = NOW() WHERE id = $1",
    [id, errorHint ?? null]
  );
}

export async function updateConnectionClientVersion(id: string, version: string): Promise<void> {
  await query(
    "UPDATE qb_connections SET last_seen_client_version = $2, updated_at = NOW() WHERE id = $1",
    [id, version]
  );
}

export interface SessionMetadata {
  companyFileName?: string;
  qbXMLCountry?: string;
  qbXMLMajorVers?: number;
  qbXMLMinorVers?: number;
  fileIDFromHCP?: string;
}

export async function updateConnectionSessionMetadata(
  id: string,
  meta: SessionMetadata
): Promise<void> {
  await query(
    `UPDATE qb_connections
     SET last_company_file_name = COALESCE($2, last_company_file_name),
         last_qb_country = COALESCE($3, last_qb_country),
         last_qbxml_major_vers = COALESCE($4, last_qbxml_major_vers),
         last_qbxml_minor_vers = COALESCE($5, last_qbxml_minor_vers),
         last_seen_file_id = COALESCE($6, last_seen_file_id),
         last_seen_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      meta.companyFileName ?? null,
      meta.qbXMLCountry ?? null,
      meta.qbXMLMajorVers ?? null,
      meta.qbXMLMinorVers ?? null,
      meta.fileIDFromHCP ?? null,
    ]
  );
}

export async function listConnections(tenantId?: string): Promise<QBConnection[]> {
  if (tenantId) {
    return query<QBConnection>("SELECT * FROM qb_connections WHERE tenant_id = $1 ORDER BY created_at DESC", [tenantId]);
  }
  return query<QBConnection>("SELECT * FROM qb_connections ORDER BY created_at DESC");
}
