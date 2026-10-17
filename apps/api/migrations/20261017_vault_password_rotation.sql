BEGIN;
-- Metadata only: existing salts, verifiers and encrypted entries are untouched.
ALTER TABLE users ADD COLUMN IF NOT EXISTS vault_revision integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vault_key_version integer NOT NULL DEFAULT 0;
COMMIT;
