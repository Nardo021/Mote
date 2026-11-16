-- Proposed initial schema for the NEW hosted Mote Cloud D1 database.
-- IMPORTANT: Do NOT run against the self-hosted Durable Object SQLite.
-- The existing Mote Protocol v1 and single-user storage stay unchanged.
--
-- Apply to an isolated staging database only after hosted Worker bindings,
-- rollback instructions, identity verification and claim transaction tests
-- have been reviewed. This is a schema scaffold, not a deployed migration.

CREATE TABLE cloud_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  apple_subject TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'deleting')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0)
);

CREATE TABLE cloud_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE CHECK (length(refresh_token_hash) = 64),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
  expires_at_ms INTEGER NOT NULL,
  revoked_at_ms INTEGER,
  CHECK (expires_at_ms > created_at_ms),
  CHECK (revoked_at_ms IS NULL OR revoked_at_ms >= created_at_ms)
);

CREATE INDEX idx_cloud_sessions_account ON cloud_sessions(account_id);
CREATE INDEX idx_cloud_sessions_expires ON cloud_sessions(expires_at_ms);

CREATE TABLE cloud_devices (
  id TEXT PRIMARY KEY NOT NULL,
  owner_account_id TEXT NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  platform TEXT NOT NULL CHECK (platform IN ('macos', 'windows')),
  credential_hash TEXT NOT NULL UNIQUE CHECK (length(credential_hash) = 64),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms)
);

CREATE INDEX idx_cloud_devices_owner_status
  ON cloud_devices(owner_account_id, status);

-- Device produces its own random device credential and polling proof locally.
-- It sends only SHA-256 digests to this service. A short-lived claim secret
-- (shown in an iOS-scannable QR) is likewise stored only as a digest.
--
-- For account approval, implement an atomic D1 transaction that:
--   1. Validates the ticket digest, pending state and expiry.
--   2. Inserts exactly one owned cloud_devices row with the committed hash.
--   3. Marks the ticket approved for the same account.
-- Any uniqueness failure or zero matching pending ticket aborts the claim.
-- Desktop checks status with the separate polling proof. No plaintext device
-- credential may be returned from any endpoint or written to D1.
CREATE TABLE cloud_pairing_tickets (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL CHECK (length(device_name) BETWEEN 1 AND 120),
  device_platform TEXT NOT NULL CHECK (device_platform IN ('macos', 'windows')),
  claim_secret_hash TEXT NOT NULL CHECK (length(claim_secret_hash) = 64),
  poll_secret_hash TEXT NOT NULL CHECK (length(poll_secret_hash) = 64),
  device_credential_hash TEXT NOT NULL CHECK (length(device_credential_hash) = 64),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  claimed_by_account_id TEXT REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
  expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > created_at_ms),
  CHECK (
    (status = 'approved' AND claimed_by_account_id IS NOT NULL)
    OR (status <> 'approved' AND claimed_by_account_id IS NULL)
  )
);

CREATE UNIQUE INDEX idx_cloud_pairing_one_pending_device
  ON cloud_pairing_tickets(device_id) WHERE status = 'pending';
CREATE INDEX idx_cloud_pairing_expiry ON cloud_pairing_tickets(status, expires_at_ms);
