import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { hashVerificationToken } from "../utils/emailVerification.js";

// One PostgreSQL statement: lock the account, consume a live address-bound
// token exactly once, update that address, and revoke sessions after a change.
// Neon HTTP supports atomic statements; callback transactions are unsupported.
export async function consumeVerification(rawToken: string) {
  const result = await db.execute(sql`
    WITH account AS MATERIALIZED (
      SELECT u.id FROM users u JOIN email_verification_tokens t ON t.user_id=u.id
      WHERE t.token_hash=${hashVerificationToken(rawToken)} AND t.expires_at>now()
      AND ((t.purpose='verify' AND t.target_email=u.email)
        OR (t.purpose='change' AND t.target_email=u.pending_email)) FOR UPDATE OF u
    ), consumed AS (
      DELETE FROM email_verification_tokens t USING account a
      WHERE t.user_id=a.id AND t.token_hash=${hashVerificationToken(rawToken)} AND t.expires_at>now()
      RETURNING t.user_id,t.target_email,t.purpose
    ), updated AS (
      UPDATE users u SET email=c.target_email,email_verified=true,
        pending_email=CASE WHEN c.purpose='change' THEN NULL ELSE u.pending_email END,
        session_version=u.session_version+CASE WHEN c.purpose='change' THEN 1 ELSE 0 END,updated_at=now()
      FROM consumed c WHERE u.id=c.user_id RETURNING u.id,c.purpose
    ), revoked AS (
      DELETE FROM sessions s USING updated u WHERE s.user_id=u.id AND u.purpose='change'
    ) SELECT id,purpose FROM updated
  `);
  return result.rows[0] as { id: string; purpose: string } | undefined;
}
