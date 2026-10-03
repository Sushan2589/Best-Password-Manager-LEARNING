"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Save,
} from "lucide-react";

import { getVaultKey } from "@/lib/crypto/vaultKeyStore";
import { decrypt, encrypt } from "@/lib/crypto/encryption";
import {
  vaultEntrySchema,
  type VaultEntry,
} from "@/lib/validation/vaultEntry";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function EditVaultItem() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [entry, setEntry] = useState<VaultEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    async function loadItem() {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);

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
      setError(null);

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
        setError("Please check your fields and try again.");
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

      const response = await fetch(`${API_URL}/vault/${id}`, {
        method: "PATCH",
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
        throw new Error("Failed to update vault item.");
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
      <main className="min-h-screen bg-zinc-950 text-white">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <div className="mb-8 flex items-center gap-4">
            <div className="h-10 w-10 animate-pulse rounded-lg bg-zinc-800" />

            <div className="space-y-2">
              <div className="h-6 w-40 animate-pulse rounded bg-zinc-800" />
              <div className="h-4 w-64 animate-pulse rounded bg-zinc-800" />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl">
            <div className="space-y-6">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="space-y-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
                  <div className="h-11 w-full animate-pulse rounded-lg bg-zinc-800" />
                </div>
              ))}

              <div className="h-32 w-full animate-pulse rounded-lg bg-zinc-800" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!entry) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <KeyRound className="h-6 w-6 text-red-400" />
          </div>

          <h1 className="text-lg font-semibold">
            Unable to load vault item
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            {error ?? "The requested item could not be loaded."}
          </p>

          <button
            type="button"
            onClick={() => router.push("/vault")}
            className="mt-6 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
          >
            Back to Vault
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <button
            type="button"
            onClick={() => router.push("/vault")}
            className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Vault
          </button>

          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900">
              <KeyRound className="h-5 w-5 text-zinc-300" />
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Edit vault item
              </h1>

              <p className="mt-1 text-sm text-zinc-500">
                Update your saved credentials and information.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-2xl shadow-black/20">
            <div className="p-6 sm:p-8">
              <div className="space-y-6">
                {/* Title */}
                <div>
                  <label
                    htmlFor="title"
                    className="mb-2 block text-sm font-medium text-zinc-200"
                  >
                    Title
                  </label>

                  <input
                    id="title"
                    name="title"
                    defaultValue={entry.title}
                    placeholder="e.g. GitHub"
                    autoComplete="off"
                    className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  />
                </div>

                {/* Username + Email */}
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="username"
                      className="mb-2 block text-sm font-medium text-zinc-200"
                    >
                      Username
                    </label>

                    <input
                      id="username"
                      name="username"
                      defaultValue={entry.username}
                      placeholder="Username"
                      autoComplete="username"
                      className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="mb-2 block text-sm font-medium text-zinc-200"
                    >
                      Email
                    </label>

                    <input
                      id="email"
                      name="email"
                      type="email"
                      defaultValue={entry.email}
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-sm font-medium text-zinc-200"
                  >
                    Password
                  </label>

                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      defaultValue={entry.password}
                      placeholder="Password"
                      autoComplete="new-password"
                      className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 pr-11 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={
                        showPassword
                          ? "Hide password"
                          : "Show password"
                      }
                      className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-zinc-500 transition hover:text-zinc-200"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Website */}
                <div>
                  <label
                    htmlFor="website"
                    className="mb-2 block text-sm font-medium text-zinc-200"
                  >
                    Website
                  </label>

                  <input
                    id="website"
                    name="website"
                    type="url"
                    defaultValue={entry.website}
                    placeholder="https://example.com"
                    autoComplete="url"
                    className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label
                    htmlFor="notes"
                    className="mb-2 block text-sm font-medium text-zinc-200"
                  >
                    Notes
                  </label>

                  <textarea
                    id="notes"
                    name="notes"
                    defaultValue={entry.notes}
                    placeholder="Additional information..."
                    rows={5}
                    className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse gap-3 border-t border-zinc-800 bg-zinc-950/40 p-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => router.push("/vault")}
                disabled={saving}
                className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save changes
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-zinc-600">
            Your vault data is encrypted before being sent to the server.
          </p>
        </form>
      </div>
    </main>
  );
}