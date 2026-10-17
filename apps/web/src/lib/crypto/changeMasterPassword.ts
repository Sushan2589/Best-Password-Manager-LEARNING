import { createVaultVerifier, decrypt, deriveCryptoKey, encrypt, verifyVaultKey } from "@password-manager/crypto";
import { vaultEntrySchema, vaultRotationSchema, vaultRotationSnapshotSchema, type VaultRotation } from "@password-manager/shared";
import { clearVaultKey, getVaultGeneration, notifyMasterPasswordChange } from "./vaultKeyStore";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export type PasswordChangeInput = { accountPassword: string; currentMaster: string; newMaster: string; confirmation: string; code?: string };

// Prepare everything before the first write. Keep the original validated JSON:
// parsing and re-serializing a schema would silently strip future metadata.
export async function prepareVaultPasswordChange(raw: unknown, current: string, next: string, confirmation: string,
  check: () => void = () => {}) : Promise<VaultRotation> {
  if (!current || current.length > 1024) throw new Error("Enter your current vault master password.");
  if ([...next].length < 15 || next.length > 1024) throw new Error("Use at least 15 characters for the new master password (maximum 1024).");
  if (next !== confirmation) throw new Error("The new master passwords do not match.");
  if (current === next) throw new Error("Choose a different master password.");
  const snapshot = vaultRotationSnapshotSchema.safeParse(raw);
  if (!snapshot.success) throw new Error("Invalid vault snapshot. Nothing was changed.");
  const source = snapshot.data;
  if (!source.verifier && !source.items.length) throw new Error("Unlock and set up this empty vault first, then change its master password.");
  check();
  const oldKey = await deriveCryptoKey(current, source.vaultSalt); check();
  try {
    if (source.verifier) await verifyVaultKey(oldKey, source.accountId, source.verifier);
    for (const item of source.items) {
      check(); vaultEntrySchema.parse(JSON.parse(await decrypt(item.cipherText, item.nonce, oldKey)));
    }
  } catch { throw new Error("The current master password is incorrect, or a vault entry is damaged. Nothing was changed."); }
  check();
  const newSalt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const newKey = await deriveCryptoKey(next, newSalt); check();
  const items: VaultRotation["items"] = [];
  for (const item of source.items) {
    check();
    const plaintext = await decrypt(item.cipherText, item.nonce, oldKey);
    const encrypted = await encrypt(plaintext, newKey); check();
    if (await decrypt(encrypted.cipherText, encrypted.nonce, newKey) !== plaintext) throw new Error("Encryption verification failed. Nothing was changed.");
    items.push({ id: item.id, ...encrypted });
  }
  const verifier = await createVaultVerifier(newKey, source.accountId);
  await verifyVaultKey(newKey, source.accountId, verifier); check();
  return vaultRotationSchema.parse({ expectedSalt: source.vaultSalt, expectedRevision: source.revision, newSalt, verifier, items });
}

async function readSnapshot(response: Response) {
  if (!response.body || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Invalid vault response. Nothing was changed.");
  const reader = response.body.getReader(); let size = 0; let text = ""; const decoder = new TextDecoder();
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error("This vault is too large for a single safe password change. Nothing was changed."); }
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

export async function changeMasterPassword(input: PasswordChangeInput, signal: AbortSignal, onCommitStarted: () => void) {
  clearVaultKey(); const generation = getVaultGeneration();
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
  const check = () => {
    if (boundedSignal.aborted || generation !== getVaultGeneration()) throw new Error("Password change cancelled before saving. Nothing was changed.");
  };
  let submitted = false;
  try {
    check();
    const response = await fetch(`${API}/vault/rotation-snapshot`, { credentials: "include", cache: "no-store", redirect: "error", signal: boundedSignal });
    if (!response.ok) throw new Error("A verified, active session is required. Sign in again and retry.");
    const snapshot = await readSnapshot(response); check();
    const rotation = await prepareVaultPasswordChange(snapshot, input.currentMaster, input.newMaster, input.confirmation, check);
    const body = JSON.stringify({ accountPassword: input.accountPassword, ...(input.code ? { code: input.code } : {}), rotation });
    if (new TextEncoder().encode(body).byteLength > 3 * 1024 * 1024) throw new Error("This vault is too large for a single safe password change. Nothing was changed.");
    check();
    // Lock other web tabs before commit. The server revokes every session as
    // part of that same commit; extension workers observe revocation normally.
    notifyMasterPasswordChange(); onCommitStarted(); submitted = true;
    let result: Response;
    try {
      result = await fetch(`${API}/vault/change-password`, { method: "POST", credentials: "include", redirect: "error", cache: "no-store", signal: boundedSignal,
        headers: { "Content-Type": "application/json", "X-Vault-Account": snapshot.accountId }, body });
    } catch { throw new Error("The save result could not be confirmed. Sign in with your existing account password and try unlocking with the new master password; if it fails, try the old one. Do not repeat the change blindly."); }
    if (result.ok) return;
    if (result.status === 401) throw new Error("Identity verification failed. Check your current sign-in password and, if enabled, enter a fresh authenticator or unused recovery code. Nothing was changed.");
    if (result.status === 409) throw new Error("Your vault or session changed during preparation. Nothing was changed by this request. Close other edits, sign in again and retry.");
    if ([400, 403, 413, 429, 503].includes(result.status)) throw new Error(result.status === 429 ? "Too many attempts. Wait before trying again. Nothing was changed." : "The server rejected this password change. Check your session and retry. Nothing was changed.");
    throw new Error("The save result could not be confirmed. Sign in with your existing account password and try the new master password first, then the old one. Do not repeat the change blindly.");
  } finally {
    input.accountPassword = ""; input.currentMaster = ""; input.newMaster = ""; input.confirmation = ""; input.code = "";
    if (submitted) notifyMasterPasswordChange(); else clearVaultKey();
  }
}
