"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { getVaultKey } from "@/lib/crypto/vaultKeyStore";
import {
  decrypt,
  encrypt,
} from "@/lib/crypto/encryption";

import {
  vaultEntrySchema,
  type VaultEntry,
} from "@/lib/validation/vaultEntry";

import CredentialForm from "@/app/components/vault/CredentialForm"; 

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function EditVaultItem() {
  const router = useRouter();
  const params = useParams();

  const id = params.id as string;

  const [entry, setEntry] = useState<VaultEntry | null>(
    null,
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadItem() {
      if (!id) return;

      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_URL}/vault/${id}`,
          {
            credentials: "include",
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch vault item");
        }

        const vaultKey = getVaultKey();

        if (!vaultKey) {
          throw new Error("Vault is locked");
        }

        const encryptedItem = await response.json();

        const plaintext = await decrypt(
          encryptedItem.cipherText,
          encryptedItem.nonce,
          vaultKey,
        );

        const decryptedEntry = JSON.parse(plaintext);

        const result =
          vaultEntrySchema.safeParse(decryptedEntry);

        if (!result.success) {
          throw new Error("Invalid vault entry");
        }

        setEntry(result.data);
      } catch (error) {
        console.error(error);

        setError(
          error instanceof Error
            ? error.message
            : "Failed to load vault item.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadItem();
  }, [id]);

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");

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
            "Please check your fields.",
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

      const response = await fetch(
        `${API_URL}/vault/${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            cipherText,
            nonce,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          "Failed to update vault item.",
        );
      }

      router.push("/vault");
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f4f7] px-5 py-10 text-[#18214d]">
        <div className="mx-auto max-w-[900px]">
          <div className="mb-8 space-y-3">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div className="h-10 w-64 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-200" />
          </div>

          <div className="rounded-[28px] bg-white p-8 shadow-sm">
            <div className="space-y-6">
              {[1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="space-y-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                  <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!entry) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f4f7] px-5 text-[#18214d]">
        <div className="w-full max-w-md rounded-[28px] bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            🔑
          </div>

          <h1 className="mt-5 text-lg font-bold">
            Unable to load vault item
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {error ||
              "The requested item could not be loaded."}
          </p>

          <button
            type="button"
            onClick={() => router.push("/vault")}
            className="mt-6 rounded-xl bg-[#18214d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#11183d]"
          >
            Back to Vault
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f4f7] text-[#18214d]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-4 sm:px-8">
          <button
            type="button"
            onClick={() => router.push("/vault")}
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
            Edit Credential
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Update your saved credentials and information.
          </p>
        </div>

        <CredentialForm
          mode="edit"
          initialData={entry}
          saving={saving}
          error={error}
          onSubmit={handleSubmit}
          onCancel={() => router.push("/vault")}
        />
      </div>
    </main>
  );
}