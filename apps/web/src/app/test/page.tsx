"use client";

import { unlockVault } from "@/lib/crypto/unlockVault";
import { getVaultKey } from "@/lib/crypto/vaultKeyStore";

export default function TestPage() {
  async function handleTestUnlock() {
    const password = prompt("Enter master password:");
    if (!password) return;

    try {
      const success = await unlockVault(password);
      console.log("unlock success:", success);
      console.log("key in store:", getVaultKey());
    } catch (err) {
      console.error("unlock failed:", err);
    }
  }

  return (
    <main>
      <button onClick={handleTestUnlock}>Test Unlock</button>
    </main>
  );
}