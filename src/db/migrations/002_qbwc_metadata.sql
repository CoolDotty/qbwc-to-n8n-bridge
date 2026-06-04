ALTER TABLE qb_connections
  ADD COLUMN IF NOT EXISTS auth_flags TEXT NOT NULL DEFAULT '0xF',
  ADD COLUMN IF NOT EXISTS last_company_file_name TEXT,
  ADD COLUMN IF NOT EXISTS last_qb_country TEXT,
  ADD COLUMN IF NOT EXISTS last_qbxml_major_vers INTEGER,
  ADD COLUMN IF NOT EXISTS last_qbxml_minor_vers INTEGER,
  ADD COLUMN IF NOT EXISTS last_seen_file_id TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
