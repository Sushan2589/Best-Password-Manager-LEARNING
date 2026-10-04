"use client";

import { vaultEntrySchema } from "@/lib/validation/vaultEntry";
import { encrypt } from "@/lib/crypto/encryption";
import { getVaultKey } from "@/lib/crypto/vaultKeyStore";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import CredentialForm from "@/app/components/vault/CredentialForm";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function VaultEntry() {
  const router = useRouter();

  const [unlocked, setUnlocked] = useState(
    () => getVaultKey() !== null,
  );

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!unlocked) {
      router.replace("/vault");
    }
  }, [unlocked, router]);

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();

    setError("");
    setSaving(true);

    try {
      const formData = new FormData(e.currentTarget);

      const data = {
        title: formData.get("title")?.toString() ?? "",
        username:
          formData.get("username")?.toString() || undefined,
        email:
          formData.get("email")?.toString() || undefined,
        password:
          formData.get("password")?.toString() ?? "",
        website:
          formData.get("website")?.toString() || undefined,
        notes:
          formData.get("notes")?.toString() || undefined,
      };

      const result = vaultEntrySchema.safeParse(data);

      if (!result.success) {
        setError(
          result.error.issues[0]?.message ??
            "Invalid input",
        );
        return;
      }

      const vaultKey = getVaultKey();

      if (!vaultKey) {
        setError("Vault is locked.");
        return;
      }

      const plaintext = JSON.stringify(result.data);

      const { cipherText, nonce } = await encrypt(
        plaintext,
        vaultKey,
      );

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
        setError("Failed to save credential.");
        return;
      }

      router.push("/vault");
    } catch (error) {
      console.error(error);
      setError("Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  }

  if (!unlocked) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f6f4f7] text-[#18214d]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-4 sm:px-8">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-[#18214d]"
          >
            <span className="text-lg">←</span>
            Back to Vault
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#18214d] text-sm text-white">
              🔐
            </div>

            <span className="hidden text-sm font-bold sm:block">
              Password Manager
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[900px] px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8">
          <p className="mb-2 text-sm font-medium text-[#c45b48]">
            Your Vault
          </p>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Add Credential
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Store a login credential securely in your
            encrypted vault.
          </p>
        </div>

        <CredentialForm
          mode="create"
          saving={saving}
          error={error}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
        />
      </div>
    </main>
  );
}