let vaultKey: CryptoKey | null = null;
let salt: string | null = null;
let owner: string | null = null;
let generation = 0;
let deadline = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
export const getVaultGeneration = () => generation;
export const getVaultOwner = () => getVaultKey() ? owner : null;

export const getVaultSalt = () => getVaultKey() ? salt : null;

export function setVaultKey(key: CryptoKey, accountId?: string, sessionExpiresAt?: string, vaultSalt?: string) {
  vaultKey = key;
  owner = accountId ?? null;
  salt = vaultSalt ?? null;
  deadline = Math.min(Date.now() + 15 * 60_000, sessionExpiresAt ? Date.parse(sessionExpiresAt) : Infinity);
  if (timer) clearTimeout(timer);
  timer = setTimeout(clearVaultKey, Math.max(0, deadline - Date.now()));
}

export function getVaultKey(): CryptoKey | null {
  if (vaultKey && Date.now() >= deadline) clearVaultKey();
  return vaultKey;
}

export function clearVaultKey() {
  generation++;
  vaultKey = null;
  owner = null;
  salt = null;
  if (timer) clearTimeout(timer);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("vault-locked"));
}

// Only a lock notification crosses tabs. Keys, passwords and entries never do.
let channel: BroadcastChannel | undefined;
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  channel = new BroadcastChannel("vault-security-events");
  channel.onmessage = event => { if (event.data === "master-password-change") clearVaultKey(); };
}
export function notifyMasterPasswordChange() {
  clearVaultKey();
  channel?.postMessage("master-password-change");
}
