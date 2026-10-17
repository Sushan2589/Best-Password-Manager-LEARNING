import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

export type VaultActor = { userId: string; sessionId: string; sessionVersion: number };
// All vault writers update the same account row. Rotation compares the revision
// on that row, so edits/inserts/deletes cannot slip past a stale MVCC snapshot.
export function vaultActorCondition(actor: VaultActor, salt?: string) {
  return sql`u.id=${actor.userId} AND u.session_version=${actor.sessionVersion}
    AND (u.vault_salt=${salt ?? null} OR (${salt ?? null}::text IS NULL AND u.vault_key_version=0))
    AND EXISTS(SELECT 1 FROM sessions s WHERE s.id=${actor.sessionId} AND s.user_id=u.id
      AND s.session_version=u.session_version AND s.expires_at>now()
      AND s.last_used_at>now()-interval '30 minutes')`;
}
export function vaultWriteGate(actor: VaultActor, salt?: string) {
  return sql`UPDATE users u SET vault_revision=u.vault_revision+1
    WHERE ${vaultActorCondition(actor, salt)} RETURNING u.id`;
}
const returnedItem = sql`v.id,v.user_id AS "userId",v.cipher_text AS "cipherText",v.nonce,
  to_char(v.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
  to_char(v.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"`;

export async function mutateVault(actor: VaultActor, salt: string | undefined,
  change: { kind: "create" | "update" | "delete"; id?: string; cipherText?: string; nonce?: string; expectedCipherText?: string }) {
  const gate = vaultWriteGate(actor, salt);
  const operation = change.kind === "create"
    ? sql`INSERT INTO vault_items AS v(user_id,cipher_text,nonce) SELECT id,${change.cipherText},${change.nonce} FROM gate RETURNING ${returnedItem}`
    : change.kind === "update"
      ? sql`UPDATE vault_items v SET cipher_text=${change.cipherText},nonce=${change.nonce},updated_at=now()
          FROM gate g WHERE v.user_id=g.id AND v.id=${change.id}
          ${change.expectedCipherText ? sql`AND v.cipher_text=${change.expectedCipherText}` : sql``} RETURNING ${returnedItem}`
      : sql`DELETE FROM vault_items v USING gate g WHERE v.user_id=g.id AND v.id=${change.id} RETURNING ${returnedItem}`;
  const result = await db.execute(sql`WITH gate AS (${gate}), changed AS (${operation})
    SELECT (SELECT count(*) FROM gate)::int AS admitted,(SELECT row_to_json(changed) FROM changed) AS item`);
  return result.rows[0] as { admitted: number; item: unknown | null };
}

export async function initializeVaultVerifier(actor: VaultActor, salt: string | undefined, verifier: { cipherText: string; nonce: string }) {
  const result = await db.execute(sql`UPDATE users u SET vault_revision=u.vault_revision+1,
    vault_verifier_cipher=${verifier.cipherText},vault_verifier_nonce=${verifier.nonce}
    WHERE ${vaultActorCondition(actor, salt)} AND u.vault_verifier_cipher IS NULL
    AND NOT EXISTS(SELECT 1 FROM vault_items WHERE user_id=u.id) RETURNING u.id`);
  return result.rows.length === 1;
}
