"use client";

import { unlockVault } from "@/lib/crypto/unlockVault";

export default function TestPage() {
  async function handleTestUnlock() {
    const password = prompt("Enter master password:");
    if (!password) return;

    try {
      await unlockVault(password);
      console.log("Vault unlock test completed.");
    } catch {
      console.error("Vault unlock test failed.");
    }
  }

  return (
    <main>
      <button onClick={handleTestUnlock}>Test Unlock</button>
    </main>
  );
}
