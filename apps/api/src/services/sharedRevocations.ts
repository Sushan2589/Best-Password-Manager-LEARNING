export interface RevocationStore {
  block(hash: string): void | Promise<void>;
  complete(hash: string): void | Promise<void>;
  denied(hash: string): boolean | Promise<boolean>;
  pending(): string[];
}

export type RevocationQuery = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

// Use the primary of an independent database, never a cache or read replica.
// Seven days exceeds the 24-hour session lifetime (and legacy migration cap).
// No process-local cache: every instance observes committed revocations.
export class SharedRevocationStore implements RevocationStore {
  constructor(private query: RevocationQuery) {}

  private validate(hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid session hash.");
  }

  async block(hash: string) {
    this.validate(hash);
    await this.query(`INSERT INTO session_revocations (session_token_hash, expires_at)
      VALUES ($1, now() + interval '7 days')
      ON CONFLICT (session_token_hash) DO UPDATE
      SET expires_at = GREATEST(session_revocations.expires_at, EXCLUDED.expires_at)`, [hash]);
  }

  async denied(hash: string) {
    this.validate(hash);
    const rows = await this.query(`SELECT EXISTS (
      SELECT 1 FROM session_revocations WHERE session_token_hash = $1 AND expires_at > now()
    ) AS denied`, [hash]);
    if (typeof rows[0]?.denied !== "boolean") throw new Error("Security state storage unavailable.");
    return rows[0].denied;
  }

  // Retain tombstones even after a successful deletion. No recurring worker is
  // needed: the authoritative session expires before its tombstone does.
  complete(_hash: string) {}
  pending(): string[] { return []; }
}
