let vaultKey: CryptoKey | null = null;

export function setVaultKey(key: CryptoKey) {
  vaultKey = key;
}

export function getVaultKey(): CryptoKey | null {
  return vaultKey;
}

export function clearVaultKey() {
  vaultKey = null;
}