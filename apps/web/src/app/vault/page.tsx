"use client";

import { getVaultKey } from "@/lib/crypto/vaultKeyStore";
import { decrypt } from "@/lib/crypto/encryption";
import { useEffect, useState } from "react";
import { unlockVault } from "@/lib/crypto/unlockVault";
import type { VaultEntry } from "@/lib/validation/vaultEntry";
import { useRouter } from "next/navigation";
import { clearVaultKey } from "@/lib/crypto/vaultKeyStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type VaultItem = {
  id: string;
  userId: string;
  cipherText: string;
  nonce: string;
  createdAt: string;
  updatedAt: string;
};

type DecryptedVaultItem = VaultEntry & {
  id: string;
};

const VaultView = () => {
  const router = useRouter();
  const [vaultItems, setVaultItems] = useState<DecryptedVaultItem[]>([]);

  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(() => {
    return getVaultKey() !== null;
  });
  const [error, setError] = useState("");

  async function handleDelete(id: string) {
    if (!confirm("Delete this vault item?")) return;
    const response = await fetch(`${API_URL}/vault/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      console.error("Failed to delete item");
      return;
    }

    // remove it from the current UI
    setVaultItems((items) => items.filter((item) => item.id !== id));
  }

  function handleLock() {
    clearVaultKey();
    setUnlocked(false);
    setVaultItems([]);
  }

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

  async function handleLogout() {
    const response = await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });

    if(!response.ok)
    {
      return;
    }

    clearVaultKey();
    setVaultItems([]);
    setUnlocked(false);

    router.push("/login");
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

          return {
            id: item.id,
            ...JSON.parse(plaintext),
          };
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
        <div>
          <button onClick={handleLock}>Lock Vault</button>
          <button onClick={handleLogout}>Logout</button>
        </div>
        {vaultItems.map((item) => (
          <div key={item.id}>
            <p>Title: {item.title}</p>
            <p>Username: {item.username}</p>
            <p>Email: {item.email}</p>
            <p>Password: {item.password}</p>

            <button onClick={() => router.push(`/vault/${item.id}/edit`)}>
              Edit
            </button>

            <button onClick={() => handleDelete(item.id)}>Delete</button>
          </div>
        ))}
      </div>
    );
  }
};

export default VaultView;
