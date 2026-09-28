"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getVaultKey } from "@/lib/crypto/vaultKeyStore";
import { decrypt } from "@/lib/crypto/encryption";
import { encrypt } from "@/lib/crypto/encryption";
import type { VaultEntry } from "@/lib/validation/vaultEntry";
import { vaultEntrySchema } from "@/lib/validation/vaultEntry";
import { useRouter } from "next/navigation";


const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export default function EditVaultItem() {
    const router = useRouter()
  const params = useParams();
  const id = params.id as string;

  const [entry, setEntry] = useState<VaultEntry | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);

    const data = {
      title: formData.get("title")?.toString() ?? "",
      username: formData.get("username")?.toString() ?? "",
      email: formData.get("email")?.toString() ?? "",
      password: formData.get("password")?.toString() ?? "",
      website: formData.get("website")?.toString() ?? "",
      notes: formData.get("notes")?.toString() ?? "",
    };

    const result = vaultEntrySchema.safeParse(data);

    if (!result.success) {
      console.log(result.error);
      return;
    }

    const vaultEntry = result.data;
    const plaintext = JSON.stringify(vaultEntry);

    const vaultKey = getVaultKey();

    if (!vaultKey) {
      console.log("Vault is locked");
      return;
    }

    const { cipherText, nonce } = await encrypt(plaintext, vaultKey);

    // 2. Send data to the backend
    const response = await fetch(`http://localhost:3001/vault/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cipherText,
        nonce,
      }),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(error);
      return;
    }

    const updatedItem = await response.json();
    console.log("Success:", updatedItem);

    router.push("/vault");
  }

  useEffect(() => {
    async function loadItem() {
      if (!id) return;

      console.log("Loading item:", id);

      const response = await fetch(`${API_URL}/vault/${id}`, {
        credentials: "include",
      });

      console.log("Response:", response.status);

      if (!response.ok) {
        console.error("Failed to fetch vault");
        return;
      }

      const vaultKey = getVaultKey();

      if (!vaultKey) {
        console.log("Vault is locked");
        return;
      }

      const encryptedItem = await response.json();

      const plaintext = await decrypt(
        encryptedItem.cipherText,
        encryptedItem.nonce,
        vaultKey,
      );

      const decryptedPlainText = JSON.parse(plaintext);
      setEntry(decryptedPlainText);
    }

    loadItem();
  }, [id]);

  console.log(id);

  if (!entry) {
    return <div>Loading...</div>; //ADD proper ERROR
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" defaultValue={entry.title} />
      <input name="username" defaultValue={entry.username} />
      <input name="email" defaultValue={entry.email} />
      <input name="password" defaultValue={entry.password} />
      <input name="website" defaultValue={entry.website} />
      <input name="notes" defaultValue={entry.notes} />


      <button type="submit">Save</button>
    </form>
  );
}
