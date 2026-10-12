let vaultKey: CryptoKey | null = null;
let owner: string | null = null;
let generation = 0;
let deadline = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
export const getVaultGeneration = () => generation;
export const getVaultOwner = () => getVaultKey() ? owner : null;

export function setVaultKey(key: CryptoKey, accountId?: string, sessionExpiresAt?: string) {
  vaultKey = key;
  owner = accountId ?? null;
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
  if (timer) clearTimeout(timer);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("vault-locked"));
}
