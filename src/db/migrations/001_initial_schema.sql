CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qb_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  owner_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  qb_type TEXT NOT NULL DEFAULT 'US',
  is_read_only BOOLEAN NOT NULL DEFAULT FALSE,
  poll_minutes INT NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'active',
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_company_file_hint TEXT,
  last_seen_client_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qb_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID NOT NULL REFERENCES qb_connections(id) ON DELETE CASCADE,
  ticket TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qb_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES qb_connections(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','sent','succeeded','failed','dead_letter')),
  priority INT NOT NULL DEFAULT 0,
  qbxml_request TEXT,
  normalized_payload JSONB,
  leased_until TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_jobs_idempotency ON qb_jobs(connection_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qb_jobs_status ON qb_jobs(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_qb_jobs_connection ON qb_jobs(connection_id, status);

CREATE TABLE IF NOT EXISTS qb_job_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES qb_jobs(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  status TEXT NOT NULL,
  request_xml TEXT,
  response_xml TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qb_sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID NOT NULL REFERENCES qb_connections(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  cursor_value TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(connection_id, entity_type)
);

CREATE TABLE IF NOT EXISTS qb_raw_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES qb_jobs(id) ON DELETE SET NULL,
  connection_id UUID NOT NULL REFERENCES qb_connections(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('request','response')),
  raw_xml TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbound_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES qb_connections(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','delivered','failed')),
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_events_status ON outbound_events(delivery_status, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  connection_id UUID REFERENCES qb_connections(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
