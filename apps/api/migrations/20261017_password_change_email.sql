-- Historical: password changes no longer require email challenges.
-- Not required for the current flow; retained for already-deployed DB history.
BEGIN;
CREATE TABLE IF NOT EXISTS password_change_challenges (
  challenge_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('login', 'vault')),
  target_email text NOT NULL,
  password_fingerprint text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamp NOT NULL,
  UNIQUE(user_id, purpose)
);
COMMIT;
