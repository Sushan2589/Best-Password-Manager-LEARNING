"use client";

import { getVaultKey } from "@/lib/crypto/vaultKeyStore";
import { decrypt } from "@/lib/crypto/encryption";
import { useEffect, useState } from "react";
import { unlockVault } from "@/lib/crypto/unlockVault";
import type { VaultEntry } from "@/lib/validation/vaultEntry";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type VaultItem = {
  id: string;
  userId: string;
  cipherText: string;
  nonce: string;
  createdAt: string;
  updatedAt: string;
};

const VaultView = () => {
  const [vaultItems, setVaultItems] = useState<VaultEntry[]>([]);

  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");

  async function handleUnlock() {
    setError("");

    try {
      await unlockVault(password);
      setPassword("");
      setUnlocked(true);
    } catch (error) {
      console.error(error);
      setError("Failed to unlock vault");
    }
  }

  useEffect(() => {
    if (!unlocked) return;

    async function loadVault() {
      const response = await fetch(`${API_URL}/vault`, {
        credentials: "include",
      });

      if (!response.ok) {
        console.error("Failed to fetch vault");
        return;
      }

      const vaultKey = getVaultKey();

      if (!vaultKey) {
        console.log("Vault is locked");
        return;
      }

      const data = await response.json();

      const decryptedItems = await Promise.all(
        data.map(async (item: VaultItem) => {
          const ciphertext = item.cipherText;
          const nonce = item.nonce;

          const plaintext = await decrypt(ciphertext, nonce, vaultKey);

          return JSON.parse(plaintext);
        }),
      );
      setVaultItems(decryptedItems);
    }

    loadVault();
  }, [unlocked]);

  if (!unlocked) {
    return (
      <div>
        <h1>Unlock Vault</h1>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Master password"
        />

        <button onClick={handleUnlock}>Unlock</button>

        {error && <p>{error}</p>}
      </div>
    );
  } else {
    return (
      <div>
        {vaultItems.map((item) => (
          <div key={item.title}>
            <p>Title: {item.title}</p>
            <p>Username: {item.username}</p>
            <p>Email: {item.email}</p>
            <p>Password: {item.password}</p>
          </div>
        ))}
      </div>
    );
  }
};

export default VaultView;
