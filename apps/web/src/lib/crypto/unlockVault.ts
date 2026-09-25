import { deriveVaultKey } from "./key";
import { setVaultKey} from "./vaultKeyStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function unlockVault(password: string): Promise<boolean> {
  // 1. get vaultSalt for the current user
  const res = await fetch(`${API_URL}/user/me`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Not logged in, or failed to fetch user info.");
  }

  const { vaultSalt } = await res.json();

  // 2. derive the raw key bytes from password + salt
  const rawKey = await deriveVaultKey(password, vaultSalt);
  

  // 3. import as a CryptoKey Web Crypto can actually use
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  // 4. store it in memory
  setVaultKey(cryptoKey);

  return true;
}


