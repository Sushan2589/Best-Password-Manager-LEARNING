import { deriveCryptoKey, decrypt, createVaultVerifier, verifyVaultKey } from "@password-manager/crypto";
import { vaultEntrySchema, encryptedVaultItemSchema } from "@password-manager/shared";
import { clearVaultKey, getVaultGeneration, getVaultKey, getVaultOwner, getVaultSalt, setVaultKey } from "./vaultKeyStore";
import { API_URL } from "../api";

async function profile() {
  const response = await fetch(`${API_URL}/user/me`, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("Session unavailable.");
  const account = await response.json();
  if (!account.id || !account.emailVerified || !account.vaultSalt || Date.parse(account.sessionExpiresAt) <= Date.now() || !Number.isFinite(Date.parse(account.sessionExpiresAt))) throw new Error("Verified session required.");
  return account;
}
export async function needsVaultSetup(): Promise<boolean> {
  const account = await profile();
  if (account.vaultVerifierCipher || account.vaultVerifierNonce) return false;
  const response = await fetch(`${API_URL}/vault`, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("Vault unavailable.");
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("Invalid vault.");
  // Legacy vaults may have entries but no verifier. Never offer to replace
  // their password: the existing password must decrypt those entries first.
  return rows.length === 0;
}

export async function unlockVault(password: string, confirmation?: string): Promise<boolean> {
  clearVaultKey(); const generation = getVaultGeneration();
  try {
    const account = await profile();
    const response = await fetch(`${API_URL}/vault`, { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error("Vault unavailable.");
    const rows: unknown = await response.json(); if (!Array.isArray(rows)) throw new Error("Invalid vault.");
    const key = await deriveCryptoKey(password, account.vaultSalt);
    if (account.vaultVerifierCipher) await verifyVaultKey(key, account.id, { cipherText: account.vaultVerifierCipher, nonce: account.vaultVerifierNonce });
    for (const row of rows) {
      const entry = encryptedVaultItemSchema.parse(row);
      if (entry.userId !== account.id) throw new Error("Account changed.");
      vaultEntrySchema.parse(JSON.parse(await decrypt(entry.cipherText, entry.nonce, key)));
    }
    if (!account.vaultVerifierCipher && rows.length === 0) {
      if (!confirmation || confirmation !== password || [...password].length < 15) throw new Error("EMPTY_VAULT_SETUP");
      if (getVaultGeneration() !== generation) throw new Error("Unlock cancelled.");
      const verifier = await createVaultVerifier(key, account.id);
      if (getVaultGeneration() !== generation) throw new Error("Unlock cancelled.");
      const setup = await fetch(`${API_URL}/vault/setup`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Vault-Account": account.id, "X-Vault-Salt": account.vaultSalt }, body: JSON.stringify(verifier) });
      if (!setup.ok) throw new Error("Vault setup changed. Try unlocking again.");
    }
    const confirmed = await profile();
    if (getVaultGeneration() !== generation || confirmed.id !== account.id || confirmed.vaultSalt !== account.vaultSalt) throw new Error("Unlock cancelled.");
    setVaultKey(key, account.id, confirmed.sessionExpiresAt, confirmed.vaultSalt); return true;
  } catch (error) { if (getVaultGeneration() === generation) clearVaultKey(); throw error; }
}
export async function authorizeVaultKey() {
  const key = getVaultKey(); const owner = getVaultOwner(); const generation = getVaultGeneration();
  try {
    const account = await profile();
    if (!key || !owner || owner !== account.id || getVaultSalt() !== account.vaultSalt || getVaultKey() !== key || getVaultGeneration() !== generation) throw new Error("Vault locked.");
    return { key, accountId: owner, vaultSalt: account.vaultSalt as string };
  } catch { clearVaultKey(); throw new Error("Vault locked or session expired."); }
}
