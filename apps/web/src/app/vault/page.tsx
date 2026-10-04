"use client";

import { clearVaultKey, getVaultKey } from "@/lib/crypto/vaultKeyStore";
import { decrypt } from "@/lib/crypto/encryption";
import { unlockVault } from "@/lib/crypto/unlockVault";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import Sidebar from "../components/vault/Sidebar";
import Topbar from "../components/vault/Topbar";
import SecurityScore from "../components/vault/SecurityScore";
import SearchBar from "../components/vault/SearchBar";
import VaultGrid from "../components/vault/VaultGrid";
import EmptyVault from "../components/vault/EmptyVault";
import DeleteModal from "../components/vault/DeleteModal";

import type { DecryptedVaultItem, VaultItem } from "../components/vault/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type VaultFilter = "all" | "recent" | "edited";

export default function VaultView() {
  const router = useRouter();

  const [vaultItems, setVaultItems] = useState<DecryptedVaultItem[]>([]);

  const [password, setPassword] = useState("");

  const [unlocked, setUnlocked] = useState(() => getVaultKey() !== null);

  const [loading, setLoading] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");

  const [filter, setFilter] = useState<VaultFilter>("all");

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>(
    {},
  );

  const [deleteTarget, setDeleteTarget] = useState<DecryptedVaultItem | null>(
    null,
  );

  const [deleting, setDeleting] = useState(false);

  // -----------------------------
  // Business logic
  // -----------------------------

  function handleLock() {
    clearVaultKey();
    setUnlocked(false);
    setVaultItems([]);
    setError("");
    setShowPasswords({});
  }

  async function handleUnlock() {
    setError("");
    setUnlocking(true);

    try {
      await unlockVault(password);

      setPassword("");
      setUnlocked(true);
    } catch (error) {
      console.error(error);

      setError("Incorrect master password or failed to unlock vault.");
    } finally {
      setUnlocking(false);
    }
  }

  async function handleLogout() {
    try {
      const response = await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) return;

      clearVaultKey();
      setVaultItems([]);
      setUnlocked(false);

      router.push("/login");
    } catch (error) {
      console.error(error);
    }
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
      console.error(error);
    } finally {
      setDeleting(false);
    }
  }

  // -----------------------------
  // Load vault
  // -----------------------------

  useEffect(() => {
    if (!unlocked) return;

    async function loadVault() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`${API_URL}/vault`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch vault");
        }

        const vaultKey = getVaultKey();

        if (!vaultKey) {
          throw new Error("Vault key unavailable");
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
      } catch (error) {
        console.error(error);
        setError("Failed to load your vault.");
      } finally {
        setLoading(false);
      }
    }

    loadVault();
  }, [unlocked, reloadKey]);

  // -----------------------------
  // Search + filters
  // -----------------------------

  const filteredItems = useMemo(() => {
    const items = [...vaultItems];

    if (filter === "recent") {
      items.sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime(),
      );
    }

    if (filter === "edited") {
      items.sort(
        (a, b) =>
          new Date(b.updatedAt ?? 0).getTime() -
          new Date(a.updatedAt ?? 0).getTime(),
      );
    }

    const query = search.toLowerCase().trim();

    if (!query) {
      return items;
    }

    return items.filter((item) =>
      [item.title, item.username, item.email, item.website].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [filter, search, vaultItems]);

  // -----------------------------
  // Security score
  // -----------------------------

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

  // -----------------------------
  // Locked UI
  // -----------------------------

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
                disabled={!password.trim() || unlocking}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#c45b48] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#b84f3e] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {unlocking ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Unlocking...
                  </>
                ) : (
                  "Unlock Vault"
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // -----------------------------
  // Dashboard UI
  // -----------------------------

  return (
    <div className="min-h-screen bg-[#f6f4f7] text-[#18214d]">
      <div className="flex min-h-screen">
        <Sidebar onLock={handleLock} onLogout={handleLogout} />

        <main className="min-w-0 flex-1">
          {/* Topbar now lives inside main, so its desktop variant is
              scoped to this column's width instead of the full viewport. */}
          <Topbar onLock={handleLock} />

          <div className="mx-auto max-w-[1450px] px-5 py-6 sm:px-8 lg:px-10">
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

            <div className="mb-8">
              <SecurityScore
                score={securityScore}
                totalCredentials={vaultItems.length}
              />
            </div>

            <SearchBar
              value={search}
              onChange={setSearch}
              onAdd={() => router.push("/vault/new")}
            />

            {/* Filters */}
            <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`shrink-0 rounded-full px-5 py-2 text-xs font-semibold transition ${
                  filter === "all"
                    ? "bg-[#c45b48] text-white"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                All
              </button>

              <button
                type="button"
                onClick={() => setFilter("recent")}
                className={`shrink-0 rounded-full px-5 py-2 text-xs font-semibold transition ${
                  filter === "recent"
                    ? "bg-[#c45b48] text-white"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                Recent
              </button>

              <button
                type="button"
                onClick={() => setFilter("edited")}
                className={`shrink-0 rounded-full px-5 py-2 text-xs font-semibold transition ${
                  filter === "edited"
                    ? "bg-[#c45b48] text-white"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                Last Edited
              </button>
            </div>

            <div className="mb-4">
              <h3 className="text-lg font-bold">
                {filter === "all"
                  ? "Your credentials"
                  : filter === "recent"
                    ? "Recently added"
                    : "Recently edited"}
              </h3>

              <p className="mt-1 text-xs text-slate-400">
                {filteredItems.length}{" "}
                {filteredItems.length === 1 ? "credential" : "credentials"}
              </p>
            </div>

            {/* Loading */}
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-64 animate-pulse rounded-2xl border border-slate-200/80 bg-white p-5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-slate-200" />

                      <div className="space-y-2">
                        <div className="h-3 w-28 rounded bg-slate-200" />
                        <div className="h-2 w-20 rounded bg-slate-100" />
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      <div className="h-12 rounded-xl bg-slate-100" />
                      <div className="h-12 rounded-xl bg-slate-100" />
                    </div>

                    <div className="mt-4 flex justify-between">
                      <div className="h-8 w-16 rounded-lg bg-slate-100" />
                      <div className="h-8 w-16 rounded-lg bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              /* Error */
              <div className="rounded-2xl border border-red-100 bg-white px-6 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
                  !
                </div>

                <h3 className="mt-4 text-base font-bold text-slate-900">
                  Something went wrong
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  We couldn&apos;t load your vault. Please try again.
                </p>

                <button
                  type="button"
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="mt-5 rounded-xl bg-[#18214d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#11183d]"
                >
                  Try again
                </button>
              </div>
            ) : vaultItems.length === 0 ? (
              /* Truly empty vault */
              <EmptyVault search="" onAdd={() => router.push("/vault/new")} />
            ) : filteredItems.length === 0 ? (
              /* Search/filter empty */
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-400">
                  ?
                </div>

                <h3 className="mt-4 text-base font-bold text-slate-900">
                  No credentials found
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  No credentials match your current search or filter.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                  className="mt-5 rounded-xl bg-[#18214d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#11183d]"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <VaultGrid
                items={filteredItems}
                showPasswords={showPasswords}
                onTogglePassword={togglePassword}
                onDelete={setDeleteTarget}
              />
            )}
          </div>
        </main>
      </div>

      <DeleteModal
        item={deleteTarget}
        deleting={deleting}
        onClose={() => {
          if (!deleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleDelete}
      />
    </div>
  );
}