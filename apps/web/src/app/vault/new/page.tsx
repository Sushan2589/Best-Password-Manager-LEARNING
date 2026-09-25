"use client";

import { vaultEntrySchema } from "@/lib/validation/vaultEntry";
import { encrypt } from "@/lib/crypto/encryption";
import { getVaultKey } from "@/lib/crypto/vaultKeyStore";
import TestPage from "@/app/test/page";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const formData = new FormData(e.currentTarget);

  const data = {
    title: formData.get("title")?.toString() ?? "",
    username: formData.get("username")?.toString() || undefined,
    email: formData.get("email")?.toString() || undefined,
    password: formData.get("password")?.toString() ?? "",
    website: formData.get("website")?.toString() || undefined,
    notes: formData.get("notes")?.toString() || undefined,
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
    console.log("NO VAULT KEY")
    return;
  }

  const { cipherText, nonce } = await encrypt(plaintext, vaultKey);


  const response = await fetch(`${API_URL}/vault`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      cipherText,
      nonce,
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    console.error(error);
    return;
  }

//   const savedItem = await response.json();
//   console.log("Saved vault item:", savedItem);
};

const VaultEntry = () => {
  return (
    <main>
        <TestPage/>
      <h1>New Vault Item</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="title">Title</label>
          <input id="title" name="title" type="text" />
        </div>

        <div>
          <label htmlFor="username">Username</label>
          <input id="username" name="username" type="text" />
        </div>

        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" />
        </div>

        <div>
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="url" />
        </div>

        <div>
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" />
        </div>

        <button type="submit">Save</button>
      </form>
    </main>
  );
};

export default VaultEntry;
