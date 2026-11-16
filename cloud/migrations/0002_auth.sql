-- Mote Cloud hosted D1 ONLY. Stacked after 0001_core.sql.
-- NOT for the existing single-user Durable Object; NOT auto-deployed.

-- Access credentials are distinct from refresh credentials. Every active API
-- request must check access hash, expiry, revocation, and account status in D1.
ALTER TABLE cloud_sessions ADD COLUMN access_token_hash TEXT;
ALTER TABLE cloud_sessions ADD COLUMN access_expires_at_ms INTEGER;
CREATE UNIQUE INDEX idx_cloud_sessions_access_token_hash
  ON cloud_sessions(access_token_hash);
CREATE INDEX idx_cloud_sessions_refresh_token_hash
  ON cloud_sessions(refresh_token_hash);

-- The server issues random nonces. Only a SHA-256 nonce digest is persisted.
-- Consume with a conditional UPDATE and require exactly one affected row.
-- Multiple approvals/replays for the same challenge are rejected.
CREATE TABLE cloud_auth_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  nonce_hash TEXT NOT NULL UNIQUE CHECK (length(nonce_hash) = 64),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
  expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > created_at_ms),
  used_at_ms INTEGER CHECK (used_at_ms IS NULL OR used_at_ms >= created_at_ms)
);
CREATE INDEX idx_cloud_auth_challenges_expiry
  ON cloud_auth_challenges(expires_at_ms);
