import { deriveCryptoKey } from "@password-manager/crypto";
import { setVaultKey } from "./vaultKeyStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function unlockVault(password: string): Promise<boolean> {
  const response = await fetch(`${API_URL}/user/me`, { credentials: "include" });
  if (!response.ok) throw new Error("Not logged in, or failed to fetch user info.");
  const { vaultSalt } = await response.json();

  // Preserve the web app's existing setup flow; extension password verification
  // happens separately against authenticated ciphertext before accepting a key.
  const key = await deriveCryptoKey(password, vaultSalt);
  setVaultKey(key);
  return true;
}
