import { sql } from "drizzle-orm";
import type { VaultRotation } from "@password-manager/shared/vault";
import { db } from "../db/client.js";
import { vaultActorCondition, type VaultActor } from "./vaultMutation.js";

export async function rotationSnapshot(actor: VaultActor) {
  const result = await db.execute(sql`SELECT jsonb_build_object(
    'accountId',u.id,'vaultSalt',u.vault_salt,'revision',u.vault_revision,'keyVersion',u.vault_key_version,
    'verifier',CASE WHEN u.vault_verifier_cipher IS NULL THEN NULL ELSE jsonb_build_object('cipherText',u.vault_verifier_cipher,'nonce',u.vault_verifier_nonce) END,
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'userId',v.user_id,'cipherText',v.cipher_text,'nonce',v.nonce,
      'createdAt',to_char(v.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'updatedAt',to_char(v.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) FROM vault_items v WHERE v.user_id=u.id),'[]'::jsonb)
    ) AS snapshot FROM users u WHERE u.id=${actor.userId} AND u.session_version=${actor.sessionVersion}
    AND EXISTS(SELECT 1 FROM sessions s WHERE s.id=${actor.sessionId} AND s.user_id=u.id AND s.session_version=u.session_version
      AND s.expires_at>now() AND s.last_used_at>now()-interval '30 minutes')`);
  return result.rows[0]?.snapshot;
}

// One atomic statement supported by Neon HTTP. The revision CAS rejects every
// intervening writer, including inserts/deletes, before replacing any ciphertext.
export async function commitRotation(actor: VaultActor, passwordHash: string, rotation: VaultRotation) {
  const result = await db.execute(sql`WITH replacement AS MATERIALIZED (
    SELECT * FROM jsonb_to_recordset(${JSON.stringify(rotation.items)}::jsonb) AS r(id uuid,"cipherText" text,nonce text)
  ), rotated AS (
    UPDATE users u SET vault_salt=${rotation.newSalt},vault_verifier_cipher=${rotation.verifier.cipherText},
      vault_verifier_nonce=${rotation.verifier.nonce},vault_revision=u.vault_revision+1,
      vault_key_version=u.vault_key_version+1,session_version=u.session_version+1,updated_at=now()
    WHERE ${vaultActorCondition(actor, rotation.expectedSalt)} AND u.password_hash=${passwordHash}
      AND u.email_verified=true
      AND u.vault_revision=${rotation.expectedRevision}
      AND (SELECT count(*) FROM vault_items v WHERE v.user_id=u.id)=(SELECT count(*) FROM replacement)
      AND (SELECT count(DISTINCT id) FROM replacement)=(SELECT count(*) FROM replacement)
      AND NOT EXISTS(SELECT 1 FROM replacement r LEFT JOIN vault_items v ON v.id=r.id AND v.user_id=u.id WHERE v.id IS NULL)
    RETURNING u.id
  ), rekeyed AS (
    UPDATE vault_items v SET cipher_text=r."cipherText",nonce=r.nonce FROM replacement r,rotated u
    WHERE v.id=r.id AND v.user_id=u.id RETURNING v.id
  ), revoked AS (DELETE FROM sessions s USING rotated u WHERE s.user_id=u.id)
  SELECT id,(SELECT count(*) FROM rekeyed)::int AS count FROM rotated`);
  return result.rows[0] as { id: string; count: number } | undefined;
}
