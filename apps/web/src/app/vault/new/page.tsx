"use client";

import { vaultEntrySchema } from "@/lib/validation/vaultEntry";
import { encrypt } from "@/lib/crypto/encryption";
import { getVaultKey } from "@/lib/crypto/vaultKeyStore";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const VaultEntry = () => {
  const router = useRouter();

  const [unlocked, setUnlocked] = useState(
    () => getVaultKey() !== null
  );
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!unlocked) {
      router.replace("/vault");
    }
  }, [unlocked, router]);

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    setError("");
    setSaving(true);

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
      setError(result.error.issues[0]?.message ?? "Invalid input");
      setSaving(false);
      return;
    }

    const vaultEntry = result.data;
    const plaintext = JSON.stringify(vaultEntry);

    const vaultKey = getVaultKey();

    if (!vaultKey) {
      setError("Vault is locked.");
      setSaving(false);
      return;
    }

    try {
      const { cipherText, nonce } = await encrypt(
        plaintext,
        vaultKey
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
        const errorResponse = await response.json();
        console.error(errorResponse);
        setError("Failed to save credential.");
        setSaving(false);
        return;
      }

      router.push("/vault");
    } catch (error) {
      console.error(error);
      setError("Something went wrong while saving.");
      setSaving(false);
    }
  }

  if (!unlocked) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f6f4f7] text-[#18214d]">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-4 sm:px-8">
          <button
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
        {/* Page heading */}
        <div className="mb-8">
          <p className="mb-2 text-sm font-medium text-[#c45b48]">
            Your Vault
          </p>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Add Credential
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Store a login credential securely in your encrypted
            vault.
          </p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-[28px] bg-white p-5 shadow-[0_20px_60px_rgba(32,35,70,0.06)] ring-1 ring-slate-100 sm:p-8"
        >
          {/* Credential icon */}
          <div className="mb-8 flex items-center gap-4 rounded-2xl bg-[#f5f3f8] p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
              🔑
            </div>

            <div>
              <p className="font-semibold">Credential</p>
              <p className="mt-1 text-xs text-slate-400">
                Login information
              </p>
            </div>
          </div>

          {/* Basic information */}
          <div className="space-y-6">
            <div>
              <label
                htmlFor="title"
                className="mb-2 block text-sm font-semibold"
              >
                Title
              </label>

              <input
                id="title"
                name="title"
                type="text"
                required
                placeholder="e.g. Gmail, Netflix, GitHub"
                className="w-full rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
              />
            </div>

            <div>
              <label
                htmlFor="website"
                className="mb-2 block text-sm font-semibold"
              >
                Website
              </label>

              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  ◉
                </span>

                <input
                  id="website"
                  name="website"
                  type="url"
                  placeholder="https://example.com"
                  className="w-full rounded-xl border-0 bg-[#f8f8fa] py-3.5 pl-11 pr-4 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
                />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-sm font-semibold"
                >
                  Username
                </label>

                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Your username"
                  className="w-full rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold"
                >
                  Email
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  className="w-full rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-semibold"
                >
                  Password
                </label>

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                  className="text-xs font-semibold text-[#c45b48] hover:underline"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Enter password"
                  className="w-full rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 pr-20 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
                />
              </div>

              <p className="mt-2 text-xs text-slate-400">
                You can add a password generator here later.
              </p>
            </div>

            <div>
              <label
                htmlFor="notes"
                className="mb-2 block text-sm font-semibold"
              >
                Notes
              </label>

              <textarea
                id="notes"
                name="notes"
                rows={5}
                placeholder="Add any additional information..."
                className="w-full resize-none rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#c45b48] px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b84f3e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Credential"}
            </button>
          </div>
        </form>

        {/* Security note */}
        <div className="mt-5 flex gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4">
          <span className="text-base">🔒</span>

          <div>
            <p className="text-xs font-semibold text-slate-600">
              End-to-end encrypted
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-400">
              Your credential is encrypted in your browser before
              it is sent to the server.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
};

export default VaultEntry;