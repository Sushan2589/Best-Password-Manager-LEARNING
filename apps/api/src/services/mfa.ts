import { randomBytes, createHmac, createHash, timingSafeEqual, webcrypto } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { encrypt, decrypt } from "@password-manager/crypto";
import { db } from "../db/client.js";
import { mfaTable, recoveryCodesTable } from "../db/schema.js";

export function base32(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, value = 0, result = "";
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) result += alphabet[(value << (5 - bits)) & 31]; return result;
}
function decode(secret: string) {
  let bits = 0, value = 0; const bytes: number[] = [];
  for (const char of secret) { const digit = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char); if (digit < 0) throw new Error("Invalid secret"); value = (value << 5) | digit; bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(bytes);
}
export function totp(secret: string, step: number) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac("sha1", decode(secret)).update(counter).digest(); const offset = hash[hash.length - 1]! & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
export function matchingStep(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30_000);
  for (const step of [current + 1, current, current - 1]) if (timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  return null;
}
async function key() {
  const value = process.env.MFA_ENCRYPTION_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) throw new Error("MFA_CONFIGURATION_REQUIRED");
  return webcrypto.subtle.importKey("raw", Buffer.from(value, "hex"), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function readSecret(row: typeof mfaTable.$inferSelect) {
  const value = JSON.parse(await decrypt(row.cipherText, row.nonce, await key()));
  if (value.userId !== row.userId || typeof value.secret !== "string") throw new Error("Invalid MFA record"); return value.secret as string;
}
export async function mfaRecord(userId: string) {
  const [row] = await db.select().from(mfaTable).where(eq(mfaTable.userId, userId)).limit(1); return row;
}
export async function checkFactor(userId: string, code?: string, recent?: string | null) {
  const row = await mfaRecord(userId); if (!row?.enabled) return true;
  if (recent && Date.now() - Date.parse(recent) < 5 * 60_000 && Date.parse(recent) <= Date.now()) return true;
  if (!code) return false;
  if (/^[A-Fa-f0-9-]{32,35}$/.test(code)) {
    const hash = createHash("sha256").update(code.replace(/-/g, "").toUpperCase()).digest("hex");
    const consumed = await db.delete(recoveryCodesTable).where(and(eq(recoveryCodesTable.userId, userId), eq(recoveryCodesTable.codeHash, hash))).returning(); return consumed.length === 1;
  }
  const step = matchingStep(await readSecret(row), code); if (step === null) return false;
  const consumed = await db.update(mfaTable).set({ lastUsedStep: step }).where(and(eq(mfaTable.userId, userId), eq(mfaTable.enabled, true), lt(mfaTable.lastUsedStep, step))).returning();
  return consumed.length === 1;
}
export async function prepareMfa(userId: string) {
  const secret = base32(randomBytes(20)); const encrypted = await encrypt(JSON.stringify({ userId, secret }), await key());
  const rows = await db.insert(mfaTable).values({ userId, ...encrypted, enabled: false, setupExpiresAt: new Date(Date.now() + 10 * 60_000) })
    .onConflictDoUpdate({ target: mfaTable.userId, set: { ...encrypted, setupExpiresAt: new Date(Date.now() + 10 * 60_000) }, setWhere: eq(mfaTable.enabled, false) }).returning();
  if (!rows.length) throw new Error("MFA_ALREADY_ENABLED"); return secret;
}
export async function enableMfa(userId: string, code: string) {
  const row = await mfaRecord(userId); if (!row || row.enabled || row.setupExpiresAt <= new Date()) return null;
  const step = matchingStep(await readSecret(row), code); if (step === null) return null;
  const codes = Array.from({ length: 8 }, () => randomBytes(16).toString("hex").toUpperCase());
  // Atomic activation, recovery-code insertion and session revocation. A second
  // activation cannot replay the setup proof or return usable recovery codes.
  const hashes = codes.map(code => createHash("sha256").update(code).digest("hex"));
  const result = await db.execute(sql`WITH enabled AS (
    UPDATE account_mfa SET enabled=true,last_used_step=${step} WHERE user_id=${userId} AND enabled=false
    AND cipher_text=${row.cipherText} AND setup_expires_at>now() RETURNING user_id
  ), version AS (UPDATE users SET session_version=session_version+1 WHERE id IN (SELECT user_id FROM enabled)), recovery AS (INSERT INTO mfa_recovery_codes(user_id,code_hash)
    SELECT user_id,unnest(${sql.param(hashes)}::text[]) FROM enabled), revoked AS (
    DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM enabled)
  ) SELECT user_id FROM enabled`);
  return result.rows.length ? codes.map(code => code.match(/.{8}/g)!.join("-")) : null;
}
