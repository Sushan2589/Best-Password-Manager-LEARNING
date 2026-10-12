BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vault_verifier_cipher text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vault_verifier_nonce text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used_at timestamp NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified_at timestamp;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
ALTER TABLE email_verification_tokens ADD COLUMN IF NOT EXISTS target_email text;
ALTER TABLE email_verification_tokens ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'verify';
-- Legacy verification links lack a target address. Resend creates a bound link.
DELETE FROM email_verification_tokens WHERE target_email IS NULL;
ALTER TABLE email_verification_tokens ALTER COLUMN target_email SET NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS verification_user_idx ON email_verification_tokens(user_id);
UPDATE sessions SET expires_at=LEAST(expires_at, now()+interval '24 hours');
CREATE TABLE IF NOT EXISTS account_mfa (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cipher_text text NOT NULL, nonce text NOT NULL, enabled boolean NOT NULL DEFAULT false,
  setup_expires_at timestamp NOT NULL, last_used_step bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  code_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS recovery_user_idx ON mfa_recovery_codes(user_id);
COMMIT;
