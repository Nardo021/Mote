-- Mote Cloud D1 ONLY (after 0001_core.sql, 0002_auth.sql).
-- Single-statement atomic pairing: approving a pending ticket inserts the
-- account-owned device in the SAME SQL statement through this trigger.
-- Never apply to the existing personal Durable Object SQLite.

CREATE TRIGGER cloud_pairing_only_active_account
BEFORE UPDATE OF status ON cloud_pairing_tickets
WHEN NEW.status = 'approved' AND (
  OLD.status <> 'pending'
  OR NEW.claimed_by_account_id IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM cloud_accounts a
    WHERE a.id = NEW.claimed_by_account_id AND a.status = 'active'
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid pairing approval');
END;

CREATE TRIGGER cloud_pairing_approve_create_device
AFTER UPDATE OF status ON cloud_pairing_tickets
WHEN OLD.status = 'pending' AND NEW.status = 'approved'
BEGIN
  INSERT INTO cloud_devices (
    id, owner_account_id, name, platform, credential_hash,
    status, created_at_ms, updated_at_ms
  ) VALUES (
    NEW.device_id, NEW.claimed_by_account_id, NEW.device_name,
    NEW.device_platform, NEW.device_credential_hash,
    'active', NEW.created_at_ms, NEW.created_at_ms
  );
END;

-- After approval no status reversal may grant a second claim.
CREATE TRIGGER cloud_pairing_prevent_approved_reuse
BEFORE UPDATE OF status ON cloud_pairing_tickets
WHEN OLD.status = 'approved' AND NEW.status <> 'approved'
BEGIN
  SELECT RAISE(ABORT, 'approved ticket is immutable');
END;
