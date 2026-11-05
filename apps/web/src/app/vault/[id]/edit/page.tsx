"use client";

import { LockKeyhole as VaultMark } from "lucide-react";

import { withCredentialHistory } from "@password-manager/shared";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { authorizeVaultKey } from "@/lib/crypto/vaultSession";
import { getVaultKey } from "@/lib/crypto/vaultKeyStore";
import { decrypt, encrypt } from "@/lib/crypto/encryption";

import { vaultEntrySchema, type VaultEntry } from "@/lib/validation/vaultEntry";

import CredentialForm from "@/app/components/vault/CredentialForm";

import { API_URL } from "@/lib/api";

export default function EditVaultItem() {
  const router = useRouter();
  const params = useParams();

  const id = params.id as string;

  const [entry, setEntry] = useState<VaultEntry | null>(null);

  const [loading, setLoading] = useState(true);
  const [expectedCipherText, setExpectedCipherText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadItem() {
      if (!id) return;

      try {
        setLoading(true);
        setError("");

        const response = await fetch(`${API_URL}/vault/${id}`, {
          credentials: "include",
        });

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

        const result = vaultEntrySchema.safeParse(decryptedEntry);

        if (!result.success) {
          throw new Error("Invalid vault entry");
        }

        if (getVaultKey() !== vaultKey) throw new Error("Vault is locked");
        setExpectedCipherText(encryptedItem.cipherText);
        setEntry(result.data);
      } catch (error) {
        console.error("Credential operation failed.");

        setError(
          error instanceof Error ? error.message : "Failed to load vault item.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadItem();
  }, [id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);
      setError("");

      const formData = new FormData(e.currentTarget);

      const data = {
        ...entry,
        approvedOrigins: entry?.approvedOrigins,
        title: formData.get("title")?.toString() ?? "",
        username: formData.get("username")?.toString() || undefined,
        email: formData.get("email")?.toString() || undefined,
        password: formData.get("password")?.toString() ?? "",
        website: formData.get("website")?.toString() || undefined,
        notes: formData.get("notes")?.toString() || undefined,
      };

      const result = vaultEntrySchema.safeParse(data);

      if (!result.success) {
        setError(
          result.error.issues[0]?.message ?? "Please check your fields.",
        );
        return;
      }

      const authorized = await authorizeVaultKey();
      const vaultKey = authorized.key;

      if (!vaultKey) {
        setError("Vault is locked.");
        return;
      }

      const plaintext = JSON.stringify(
        withCredentialHistory(entry!, result.data),
      );

      const { cipherText, nonce } = await encrypt(plaintext, vaultKey);

      if (getVaultKey() !== vaultKey) throw new Error("Vault is locked");
      const response = await fetch(`${API_URL}/vault/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Vault-Account": authorized.accountId,
          "X-Vault-Salt": authorized.vaultSalt,
        },
        credentials: "include",
        body: JSON.stringify({
          expectedCipherText,
          cipherText,
          nonce,
        }),
      });

      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? "Credential changed on another device. Reload before saving."
            : "Failed to update vault item.",
        );
      }

      router.push("/vault");
    } catch (error) {
      console.error("Credential operation failed.");

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
      <main className="min-h-screen bg-[#f7f7f5] px-5 py-10 text-[#292c30]">
        <div className="mx-auto max-w-[900px]">
          <div className="mb-8 space-y-3">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div className="h-10 w-64 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-200" />
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-sm">
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
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-5 text-[#292c30]">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <VaultMark size={20} strokeWidth={1.5} aria-hidden="true" />
          </div>

          <h1 className="mt-5 text-lg font-medium">Unable to load vault item</h1>

          <p className="mt-2 text-sm text-slate-500">
            {error || "The requested item could not be loaded."}
          </p>

          <button
            type="button"
            onClick={() => router.push("/vault")}
            className="mt-6 rounded-xl bg-[#292c30] px-5 py-3 text-sm font-semibold text-white transition enabled:hover:bg-[#11183d]"
          >
            Back to Vault
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#292c30]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-4 sm:px-8">
          <button
            type="button"
            onClick={() => router.push("/vault")}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition enabled:hover:bg-slate-100 enabled:hover:text-[#292c30]"
          >
            <span className="text-lg">←</span>
            Back to Vault
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#292c30] text-sm text-white">
              <VaultMark size={20} strokeWidth={1.5} aria-hidden="true" />
            </div>

            <span className="hidden text-sm font-medium sm:block">
              Password Manager
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[900px] px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8">
          <p className="mb-2 text-sm font-medium text-[#a34536]">Your Vault</p>

          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
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
