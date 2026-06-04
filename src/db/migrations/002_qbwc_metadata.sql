ALTER TABLE qb_connections
  ADD COLUMN IF NOT EXISTS auth_flags TEXT NOT NULL DEFAULT '0xF',
  ADD COLUMN IF NOT EXISTS last_company_file_name TEXT,
  ADD COLUMN IF NOT EXISTS last_qb_country TEXT,
  ADD COLUMN IF NOT EXISTS last_qbxml_major_vers INTEGER,
  ADD COLUMN IF NOT EXISTS last_qbxml_minor_vers INTEGER,
  ADD COLUMN IF NOT EXISTS last_seen_file_id TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Defensive cleanup: QBWC only accepts the literal values 'QBFS' or 'QBPOS' in
-- <QBType>; anything else (legacy 'US'/'CA'/'UK' or stray values) causes a hard
-- QBWC1065 rejection at Web Connector registration time. Coerce to 'QBFS' so
-- the QWC always emits a valid <QBType>.
UPDATE qb_connections
  SET qb_type = 'QBFS', updated_at = NOW()
  WHERE qb_type IS NULL
     OR qb_type NOT IN ('QBFS', 'QBPOS');

-- Bound auth_flags to a sane shape. Hex (0xF) or decimal; anything else falls
-- back to '0xF' (all editions).
UPDATE qb_connections
  SET auth_flags = '0xF'
  WHERE auth_flags IS NULL
     OR auth_flags !~ '^(0x[0-9A-Fa-f]+|\d+)$';

