import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import type { VaultActor } from "./vaultMutation.js";

export async function commitLoginPassword(actor: VaultActor, currentHash: string, newHash: string) {
  // Recheck the authenticated account, current hash and session at the write.
  // A concurrent password/MFA change invalidates this operation via version CAS.
  const result = await db.execute(sql`WITH changed AS (
    UPDATE users u SET password_hash=${newHash},pending_email=NULL,session_version=u.session_version+1,updated_at=now()
    WHERE u.id=${actor.userId} AND u.session_version=${actor.sessionVersion}
      AND u.email_verified=true AND u.password_hash=${currentHash}
      AND EXISTS(SELECT 1 FROM sessions s WHERE s.id=${actor.sessionId} AND s.user_id=u.id
        AND s.session_version=u.session_version AND s.expires_at>now()
        AND s.last_used_at>now()-interval '30 minutes') RETURNING u.id
  ), cancelled AS (DELETE FROM email_verification_tokens t USING changed u WHERE t.user_id=u.id AND t.purpose='change'),
  revoked AS (DELETE FROM sessions s USING changed u WHERE s.user_id=u.id)
  SELECT id FROM changed`);
  return result.rows[0];
}
