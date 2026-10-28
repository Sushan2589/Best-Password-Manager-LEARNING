-- Run ONLY in the independent revocation database, using its primary endpoint.
-- This is intentionally separate from the application database migrations.
CREATE TABLE IF NOT EXISTS session_revocations (
  session_token_hash text PRIMARY KEY CHECK (session_token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS session_revocations_expiry_idx ON session_revocations (expires_at);

-- Optional periodic housekeeping, after expiration ONLY:
-- DELETE FROM session_revocations WHERE expires_at <= now();
