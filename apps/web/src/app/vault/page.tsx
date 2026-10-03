"use client";

import { getVaultKey, clearVaultKey } from "@/lib/crypto/vaultKeyStore";
import { decrypt } from "@/lib/crypto/encryption";
import { useEffect, useMemo, useState } from "react";
import { unlockVault } from "@/lib/crypto/unlockVault";
import type { VaultEntry } from "@/lib/validation/vaultEntry";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";

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
  createdAt?: string;
  updatedAt?: string;
};

const VaultView = () => {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<DecryptedVaultItem | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [vaultItems, setVaultItems] = useState<DecryptedVaultItem[]>([]);
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(() => getVaultKey() !== null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>(
    {},
  );

  function openDeleteModal(item: DecryptedVaultItem) {
    setDeleteTarget(item);
  }

  function closeDeleteModal() {
    if (deleting) return;

    setDeleteTarget(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    try {
      setDeleting(true);

      const response = await fetch(`${API_URL}/vault/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to delete item");
      }

      setVaultItems((items) =>
        items.filter((item) => item.id !== deleteTarget.id),
      );

      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete item:", error);
    } finally {
      setDeleting(false);
    }
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
      setError("Incorrect master password or failed to unlock vault.");
    }
  }

  async function handleLogout() {
    const response = await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
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
          const plaintext = await decrypt(
            item.cipherText,
            item.nonce,
            vaultKey,
          );

          return {
            id: item.id,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            ...JSON.parse(plaintext),
          };
        }),
      );

      setVaultItems(decryptedItems);
    }

    loadVault();
  }, [unlocked]);

  const filteredItems = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return vaultItems;

    return vaultItems.filter((item) =>
      [item.title, item.username, item.email, item.website].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [search, vaultItems]);

  const securityScore = useMemo(() => {
    if (vaultItems.length === 0) return 0;

    const secureItems = vaultItems.filter((item) => item.password.length >= 12);

    return Math.round((secureItems.length / vaultItems.length) * 100);
  }, [vaultItems]);

  function togglePassword(id: string) {
    setShowPasswords((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  function getInitial(title: string) {
    return title.charAt(0).toUpperCase();
  }

  function getHostname(url?: string) {
    if (!url) return "";

    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  }

  if (!unlocked) {
    return (
      <main className="min-h-screen bg-[#f6f4f7] px-4 py-8 text-[#18214d] sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center justify-center">
          <div className="w-full rounded-[28px] bg-white p-8 shadow-[0_20px_60px_rgba(32,35,70,0.08)]">
            <div className="mb-8">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#18214d] text-xl text-white">
                🔐
              </div>

              <p className="mb-2 text-sm font-medium text-[#c45b48]">
                Password Manager
              </p>

              <h1 className="text-3xl font-bold tracking-tight">
                Unlock your vault
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Enter your master password to access your encrypted credentials.
              </p>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleUnlock();
              }}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="master-password"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Master password
                </label>

                <input
                  id="master-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your master password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none transition focus:border-[#c45b48] focus:bg-white focus:ring-4 focus:ring-[#c45b48]/10"
                />
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-xl bg-[#c45b48] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#b84f3e]"
              >
                Unlock Vault
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f4f7] text-[#18214d]">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#18214d] text-sm text-white">
            🔐
          </div>

          <span className="font-bold">Password Manager</span>
        </div>

        <button
          onClick={handleLock}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Lock
        </button>
      </header>

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-[250px] shrink-0 border-r border-slate-200 bg-white px-5 py-6 md:flex md:flex-col">
          <div className="mb-10 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#18214d] text-white">
              🔐
            </div>

            <div>
              <p className="font-bold leading-tight">Password</p>
              <p className="text-xs text-slate-400">Manager</p>
            </div>
          </div>

          <nav className="space-y-1">
            <button className="flex w-full items-center gap-3 rounded-xl bg-[#18214d] px-4 py-3 text-left text-sm font-medium text-white">
              <span>⌂</span>
              Dashboard
            </button>

            <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-100">
              <span>▣</span>
              My Vaults
            </button>

            <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-100">
              <span>★</span>
              Favorites
            </button>

            <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-100">
              <span>⚙</span>
              Settings
            </button>
          </nav>

          <div className="mt-auto space-y-2">
            <button
              onClick={handleLock}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-100"
            >
              <span>🔒</span>
              Lock Vault
            </button>

            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-red-500 transition hover:bg-red-50"
            >
              <span>↪</span>
              Logout
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1450px] px-5 py-6 sm:px-8 lg:px-10">
            {/* Top bar */}
            <div className="mb-8 hidden items-center justify-between md:flex">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Your secure space
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight">
                  My Vault
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
                  ♧
                </button>

                <button
                  onClick={() => router.push("/account")}
                  className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#c45b48] text-sm font-bold text-white">
                    U
                  </div>

                  <span className="text-sm font-semibold">My Account</span>
                </button>
              </div>
            </div>

            {/* Welcome */}
            <section className="mb-7">
              <p className="text-sm font-medium text-slate-400">
                Welcome back 👋
              </p>

              <h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                Your credentials, secured.
              </h2>

              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Manage your passwords and sensitive credentials from one secure
                vault.
              </p>
            </section>

            {/* Overview cards */}
            <section className="mb-8 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
              {/* Security score */}
              <div className="relative overflow-hidden rounded-[24px] bg-[#20285e] p-6 text-white shadow-sm sm:p-8">
                <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border-[22px] border-[#c45b48]/20" />

                <div className="relative">
                  <p className="text-sm font-medium text-white/60">
                    Security Score
                  </p>

                  <div className="mt-5 flex items-end gap-3">
                    <span className="text-6xl font-bold tracking-tight">
                      {securityScore}%
                    </span>

                    <span className="mb-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70">
                      {securityScore >= 80 ? "Good" : "Needs attention"}
                    </span>
                  </div>

                  <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#e06b50] transition-all"
                      style={{ width: `${securityScore}%` }}
                    />
                  </div>

                  <p className="mt-4 text-xs leading-5 text-white/50">
                    Based on the strength of your stored passwords.
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
                  <p className="text-sm text-slate-400">Total credentials</p>

                  <p className="mt-3 text-3xl font-bold">{vaultItems.length}</p>

                  <p className="mt-1 text-xs text-slate-400">Stored securely</p>
                </div>

                <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
                  <p className="text-sm text-slate-400">Vault status</p>

                  <p className="mt-3 text-xl font-bold text-emerald-600">
                    Unlocked
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Encryption active
                  </p>
                </div>
              </div>
            </section>

            {/* Search + add */}
            <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  ⌕
                </span>

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search your vault..."
                  className="w-full rounded-xl border-0 bg-white py-3.5 pl-11 pr-4 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:ring-2 focus:ring-[#c45b48]/40"
                />
              </div>

              <button
                onClick={() => router.push("/vault/new")}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#c45b48] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b84f3e]"
              >
                <span className="text-lg leading-none">+</span>
                Add Credential
              </button>
            </section>

            {/* Filters */}
            <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
              <button className="shrink-0 rounded-full bg-[#c45b48] px-5 py-2 text-xs font-semibold text-white">
                All
              </button>

              <button className="shrink-0 rounded-full bg-white px-5 py-2 text-xs font-medium text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50">
                Recent
              </button>

              <button className="shrink-0 rounded-full bg-white px-5 py-2 text-xs font-medium text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50">
                Last Edited
              </button>
            </div>

            {/* Vault heading */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Your credentials</h3>

                <p className="mt-1 text-xs text-slate-400">
                  {filteredItems.length}{" "}
                  {filteredItems.length === 1 ? "credential" : "credentials"}
                </p>
              </div>
            </div>

            {/* Empty state */}
            {filteredItems.length === 0 && (
              <div className="rounded-[24px] bg-white px-6 py-16 text-center shadow-sm ring-1 ring-slate-100">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-xl">
                  {search ? "⌕" : "🔐"}
                </div>

                <h3 className="mt-5 text-lg font-bold">
                  {search ? "No credentials found" : "Your vault is empty"}
                </h3>

                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">
                  {search
                    ? "Try searching with a different title, username, email, or website."
                    : "Add your first credential to start building your secure vault."}
                </p>

                {!search && (
                  <button
                    onClick={() => router.push("/vault/new")}
                    className="mt-6 rounded-xl bg-[#c45b48] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b84f3e]"
                  >
                    Add your first credential
                  </button>
                )}
              </div>
            )}

            {/* Vault grid */}
            {filteredItems.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((item) => (
                  <article
                    key={item.id}
                    className="group rounded-[22px] bg-white p-5 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    {/* Card header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eef0f8] text-lg font-bold text-[#20285e]">
                          {getInitial(item.title)}
                        </div>

                        <div className="min-w-0">
                          <h4 className="truncate font-bold">{item.title}</h4>

                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            {getHostname(item.website) ||
                              item.email ||
                              item.username ||
                              "Credential"}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => togglePassword(item.id)}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      >
                        {showPasswords[item.id] ? "Hide" : "Show"}
                      </button>
                    </div>

                    {/* Details */}
                    <div className="mt-5 space-y-3 rounded-xl bg-[#f8f8fa] p-4">
                      {(item.username || item.email) && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Username
                          </p>

                          <p className="mt-1 truncate text-sm text-slate-700">
                            {item.username || item.email}
                          </p>
                        </div>
                      )}

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Password
                        </p>

                        <p className="mt-1 truncate font-mono text-sm text-slate-700">
                          {showPasswords[item.id]
                            ? item.password
                            : "••••••••••••"}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex items-center justify-between">
                      <button
                        onClick={() => router.push(`/vault/${item.id}/edit`)}
                        className="rounded-lg px-3 py-2 text-xs font-semibold text-[#20285e] transition hover:bg-[#eef0f8]"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => openDeleteModal(item)}
                        className="rounded-lg px-3 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) {
              closeDeleteModal();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            className="w-full max-w-md overflow-hidden rounded-[24px] bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>

                <div>
                  <h2
                    id="delete-dialog-title"
                    className="text-lg font-bold text-[#18214d]"
                  >
                    Delete credential?
                  </h2>

                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    You are about to permanently delete{" "}
                    <span className="font-semibold text-slate-700">
                      {deleteTarget.title}
                    </span>
                    .
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleting}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Warning */}
            <div className="mx-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">
                This action cannot be undone. The encrypted credential will be
                permanently removed from your vault.
              </p>
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 p-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleting}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete credential
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VaultView;
