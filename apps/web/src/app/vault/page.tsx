"use client";

import {
  clearVaultKey,
  getVaultKey,
} from "@/lib/crypto/vaultKeyStore";
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

import type {
  DecryptedVaultItem,
  VaultItem,
} from "../components/vault/types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function VaultView() {
  const router = useRouter();

  const [vaultItems, setVaultItems] = useState<
    DecryptedVaultItem[]
  >([]);

  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(
    () => getVaultKey() !== null,
  );

  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [showPasswords, setShowPasswords] = useState<
    Record<string, boolean>
  >({});

  const [deleteTarget, setDeleteTarget] =
    useState<DecryptedVaultItem | null>(null);

  const [deleting, setDeleting] = useState(false);

  // -----------------------------
  // Business logic stays here
  // -----------------------------

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
      setError(
        "Incorrect master password or failed to unlock vault.",
      );
    }
  }

  async function handleLogout() {
    const response = await fetch(
      `${API_URL}/auth/logout`,
      {
        method: "POST",
        credentials: "include",
      },
    );

    if (!response.ok) return;

    clearVaultKey();
    setVaultItems([]);
    setUnlocked(false);

    router.push("/login");
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    try {
      setDeleting(true);

      const response = await fetch(
        `${API_URL}/vault/${deleteTarget.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to delete item");
      }

      setVaultItems((items) =>
        items.filter(
          (item) => item.id !== deleteTarget.id,
        ),
      );

      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
    } finally {
      setDeleting(false);
    }
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

      if (!vaultKey) return;

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
      [
        item.title,
        item.username,
        item.email,
        item.website,
      ].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [search, vaultItems]);

  const securityScore = useMemo(() => {
    if (vaultItems.length === 0) return 0;

    const secureItems = vaultItems.filter(
      (item) => item.password.length >= 12,
    );

    return Math.round(
      (secureItems.length / vaultItems.length) * 100,
    );
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
                Enter your master password to access your
                encrypted credentials.
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
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
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

  // -----------------------------
  // Dashboard UI
  // -----------------------------

  return (
    <div className="min-h-screen bg-[#f6f4f7] text-[#18214d]">
      <Topbar onLock={handleLock} />

      <div className="flex min-h-screen">
        <Sidebar
          onLock={handleLock}
          onLogout={handleLogout}
        />

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1450px] px-5 py-6 sm:px-8 lg:px-10">
            <section className="mb-7">
              <p className="text-sm font-medium text-slate-400">
                Welcome back 👋
              </p>

              <h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                Your credentials, secured.
              </h2>

              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Manage your passwords and sensitive credentials
                from one secure vault.
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

            <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
              <button className="shrink-0 rounded-full bg-[#c45b48] px-5 py-2 text-xs font-semibold text-white">
                All
              </button>

              <button className="shrink-0 rounded-full bg-white px-5 py-2 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                Recent
              </button>

              <button className="shrink-0 rounded-full bg-white px-5 py-2 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                Last Edited
              </button>
            </div>

            <div className="mb-4">
              <h3 className="text-lg font-bold">
                Your credentials
              </h3>

              <p className="mt-1 text-xs text-slate-400">
                {filteredItems.length}{" "}
                {filteredItems.length === 1
                  ? "credential"
                  : "credentials"}
              </p>
            </div>

            {filteredItems.length === 0 ? (
              <EmptyVault
                search={search}
                onAdd={() => router.push("/vault/new")}
              />
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
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
      />
    </div>
  );
}