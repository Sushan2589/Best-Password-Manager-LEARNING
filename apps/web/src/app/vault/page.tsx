"use client";

import { LockKeyhole as VaultMark } from "lucide-react";


import { authorizeVaultKey, needsVaultSetup } from "@/lib/crypto/vaultSession";

import {
  clearVaultKey,
  getVaultKey,
  getVaultOwner,
} from "@/lib/crypto/vaultKeyStore";
import { decrypt } from "@/lib/crypto/encryption";
import { unlockVault } from "@/lib/crypto/unlockVault";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useRef } from "react";

import CredentialDetails from "../components/vault/CredentialDetails";
import { patchCredential } from "@/lib/vaultActions";
import Sidebar from "../components/vault/Sidebar";
import Topbar from "../components/vault/Topbar";
import SecurityScore from "../components/vault/SecurityScore";
import SearchBar from "../components/vault/SearchBar";
import VaultGrid from "../components/vault/VaultGrid";
import EmptyVault from "../components/vault/EmptyVault";
import DeleteModal from "../components/vault/DeleteModal";
import PasswordInput from "../components/PasswordInput";
import LoadingScreen from "../components/ui/LoadingScreen";

import {
  encryptedVaultItemSchema,
  vaultEntrySchema,
} from "@password-manager/shared";
import type { DecryptedVaultItem } from "../components/vault/types";

import { API_URL } from "@/lib/api";

type VaultFilter = "all" | "favorites" | "trash";

export default function VaultView() {
  const router = useRouter();

  const [detailId, setDetailId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [favoritePending, setFavoritePending] = useState<string | null>(null);
  const actionPending = useRef(false);
  const [vaultItems, setVaultItems] = useState<DecryptedVaultItem[]>([]);

  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupCheckFailed, setSetupCheckFailed] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const [unlocked, setUnlocked] = useState(() => getVaultKey() !== null);

  const [loading, setLoading] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");

  const [filter, setFilter] = useState<VaultFilter>("all");
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("filter") === "favorites"
    )
      setFilter("favorites");
  }, []);

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>(
    {},
  );

  const [deleteTarget, setDeleteTarget] = useState<DecryptedVaultItem | null>(
    null,
  );

  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (unlocked) return;
    let cancelled = false;
    async function check() {
      setCheckingSetup(true);
      setSetupCheckFailed(false);
      try {
        const required = await needsVaultSetup();
        if (!cancelled) {
          setSetup(required);
          setError("");
        }
      } catch {
        if (!cancelled) setSetupCheckFailed(true);
      } finally {
        if (!cancelled) setCheckingSetup(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [unlocked, reloadKey]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.ctrlKey ||
        event.metaKey ||
        document.querySelector("dialog[open]") ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)))
      )
        return;
      event.preventDefault();
      document
        .querySelector<HTMLInputElement>('[aria-label="Search your vault"]')
        ?.focus();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  // -----------------------------
  // Business logic
  // -----------------------------

  function handleLock() {
    clearVaultKey();
    setUnlocked(false);
    setVaultItems([]);
    setPassword("");
    setDeleteTarget(null);
    setLoading(false);
    setError("");
    setShowPasswords({});
  }

  useEffect(() => {
    const clear = () => {
      setUnlocked(false);
      setVaultItems([]);
      setPassword("");
      setConfirmation("");
      setShowPasswords({});
      setDeleteTarget(null);
    };
    window.addEventListener("vault-locked", clear);
    const hide = () => clearVaultKey();
    window.addEventListener("pagehide", hide);
    return () => {
      window.removeEventListener("vault-locked", clear);
      window.removeEventListener("pagehide", hide);
    };
  }, []);

  async function handleUnlock() {
    if (unlocking || checkingSetup || setupCheckFailed) return;
    setError("");
    if (setup && [...password].length < 10) {
      setError("Choose a vault password of at least 10 characters.");
      return;
    }
    if (setup && password !== confirmation) {
      setError("Vault passwords do not match.");
      return;
    }
    setUnlocking(true);

    try {
      await unlockVault(password, setup ? confirmation : undefined);

      setPassword("");
      setConfirmation("");
      setSetup(false);
      setUnlocked(true);
    } catch (error) {
      setUnlocked(false);
      if (error instanceof Error && error.message === "EMPTY_VAULT_SETUP") {
        setSetup(true);
        setError(
          "Choose a vault password of at least 10 characters and confirm it.",
        );
      } else
        setError(
          setup
            ? "Unable to create your vault. Please try again; if it was already created, reload and unlock it."
            : "Incorrect master password or failed to unlock vault.",
        );
    } finally {
      setUnlocking(false);
    }
  }

  async function handleLogout() {
    handleLock();
    try {
      const response = await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) return;

      router.push("/login");
    } catch {
      console.error("Vault operation failed.");
    }
  }

  async function restoreCredential(
    item: DecryptedVaultItem,
    changes: Parameters<typeof patchCredential>[1],
  ) {
    if (actionPending.current) return;
    actionPending.current = true;
    setFavoritePending(item.id);
    try {
      await patchCredential(item.id, changes);
      setDetailId(null);
      setReloadKey((key) => key + 1);
      setNotice(changes.history ? "History cleared." : "Credential restored.");
    } catch (failure) {
      setNotice(
        failure instanceof Error ? failure.message : "Unable to restore.",
      );
    } finally {
      actionPending.current = false;
      setFavoritePending(null);
    }
  }
  async function toggleFavorite(item: DecryptedVaultItem) {
    if (actionPending.current) return;
    actionPending.current = true;
    setFavoritePending(item.id);
    setNotice("");
    const key = getVaultKey();
    setVaultItems((items) =>
      items.map((entry) =>
        entry.id === item.id ? { ...entry, favorite: !item.favorite } : entry,
      ),
    );
    try {
      const saved = await patchCredential(item.id, {
        favorite: !item.favorite,
      });
      if (getVaultKey() === key)
        setVaultItems((items) =>
          items.map((entry) =>
            entry.id === item.id
              ? { ...entry, updatedAt: saved.updatedAt }
              : entry,
          ),
        );
    } catch (failure) {
      if (getVaultKey() === key) {
        setVaultItems((items) =>
          items.map((entry) =>
            entry.id === item.id
              ? { ...entry, favorite: item.favorite }
              : entry,
          ),
        );
        setNotice(
          failure instanceof Error
            ? failure.message
            : "Unable to save favorite.",
        );
      }
    } finally {
      actionPending.current = false;
      setFavoritePending(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;

    try {
      setDeleting(true);
      setDeleteError("");

      if (!deleteTarget.deletedAt) {
        const deletedAt = new Date().toISOString();
        await patchCredential(deleteTarget.id, { deletedAt });
        setVaultItems((items) =>
          items.map((item) =>
            item.id === deleteTarget.id ? { ...item, deletedAt } : item,
          ),
        );
        setNotice("Moved to Trash. You can restore it anytime.");
        setDeleteTarget(null);
        return;
      }
      const authorized = await authorizeVaultKey();
      const freshResponse = await fetch(`${API_URL}/vault/${deleteTarget.id}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!freshResponse.ok)
        throw new Error("Unable to read deleted credential.");
      const fresh = encryptedVaultItemSchema.parse(await freshResponse.json());
      if (
        fresh.userId !== authorized.accountId ||
        fresh.id !== deleteTarget.id ||
        getVaultKey() !== authorized.key
      )
        throw new Error("Vault changed.");
      const content = vaultEntrySchema.parse(
        JSON.parse(
          await decrypt(fresh.cipherText, fresh.nonce, authorized.key),
        ),
      );
      if (!content.deletedAt || getVaultKey() !== authorized.key)
        throw new Error(
          "Credential has been restored or vault locked. Reload first.",
        );
      const response = await fetch(`${API_URL}/vault/${deleteTarget.id}`, {
        body: JSON.stringify({ expectedCipherText: fresh.cipherText }),
        headers: {
          "Content-Type": "application/json",
          "X-Vault-Account": authorized.accountId,
          "X-Vault-Salt": authorized.vaultSalt,
        },
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
    } catch {
      setDeleteError(
        "Unable to delete. The credential may have changed on another device. Reload and retry.",
      );
    } finally {
      setDeleting(false);
    }
  }

  // -----------------------------
  // Load vault
  // -----------------------------

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;

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
          data.map(async (raw: unknown) => {
            const item = encryptedVaultItemSchema.parse(raw);
            if (item.userId !== getVaultOwner())
              throw new Error("Account changed");
            const plaintext = await decrypt(
              item.cipherText,
              item.nonce,
              vaultKey,
            );

            return {
              id: item.id,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              ...vaultEntrySchema.parse(JSON.parse(plaintext)),
            };
          }),
        );

        if (!cancelled && getVaultKey() === vaultKey)
          setVaultItems(decryptedItems);
      } catch {
        if (!cancelled) {
          clearVaultKey();
          setUnlocked(false);
          setVaultItems([]);
          setError("Vault locked: session or encrypted data changed.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadVault();
    return () => {
      cancelled = true;
    };
  }, [unlocked, reloadKey]);

  // -----------------------------
  // Search + filters
  // -----------------------------

  const filteredItems = useMemo(() => {
    const items = vaultItems.filter((item) =>
      filter === "trash"
        ? Boolean(item.deletedAt)
        : !item.deletedAt && (filter !== "favorites" || item.favorite),
    );

    const query = search.toLowerCase().trim();

    if (!query) {
      return items;
    }

    return items.filter((item) =>
      [
        item.title,
        item.username,
        item.email,
        item.website,
        item.folder,
        ...(item.tags ?? []),
      ].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [filter, search, vaultItems]);

  // -----------------------------
  // Security score
  // -----------------------------

  const securityScore = useMemo(() => {
    const activeItems = vaultItems.filter((item) => !item.deletedAt);
    if (activeItems.length === 0) return 0;

    const secureItems = activeItems.filter(
      (item) => !item.deletedAt && item.password.length >= 12,
    );

    return Math.round((secureItems.length / activeItems.length) * 100);
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

  if (!unlocked && checkingSetup)
    return <LoadingScreen message="Checking your vault..." />;
  if (!unlocked && setupCheckFailed)
    return (
      <main className="min-h-screen bg-[#f7f7f5] p-8 text-center">
        <p role="alert">Unable to check your vault. Please try again.</p>
        <button
          className="mt-4 rounded-xl bg-[#a34536] px-5 py-3 text-white"
          onClick={() => setReloadKey((value) => value + 1)}
        >
          Retry
        </button>
      </main>
    );

  if (!unlocked) {
    return (
      <main className="min-h-screen bg-[#f7f7f5] px-4 py-8 text-[#292c30] sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center justify-center">
          <div className="w-full rounded-2xl bg-white p-8 shadow-[0_20px_60px_rgba(32,35,70,0.08)]">
            <div className="mb-8">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#292c30] text-xl text-white">
                <VaultMark size={20} strokeWidth={1.5} aria-hidden="true" />
              </div>

              <p className="mb-2 text-sm font-medium text-[#a34536]">
                Password Manager
              </p>

              <h1 className="text-3xl font-medium tracking-tight">
                {setup ? "Create your vault password" : "Unlock your vault"}
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                {setup
                  ? "Your vault is new. Choose a password to protect your saved credentials. This is separate from your sign-in password."
                  : "Enter the vault password you created to access your encrypted credentials."}
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
                  {setup ? "New vault password" : "Master password"}
                </label>

                <PasswordInput
                  label="master password"
                  id="master-password"
                  autoComplete={setup ? "new-password" : "off"}
                  maxLength={1024}
                  required
                  disabled={unlocking}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    setup
                      ? "Choose a vault password"
                      : "Enter your vault password"
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none transition focus:border-[#a34536] focus:bg-white focus:ring-4 focus:ring-[#a34536]/10"
                />
              </div>

              {setup && (
                <>
                  <label className="block text-sm">
                    Confirm vault password
                    <PasswordInput
                      label="vault password confirmation"
                      autoComplete="new-password"
                      required
                      maxLength={1024}
                      disabled={unlocking}
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      className="mt-2 w-full rounded-xl border p-3"
                    />
                  </label>
                  <p className="text-sm leading-6 text-slate-500">
                    Use at least 10 characters. Your vault password stays on
                    your device and cannot be recovered if forgotten. Keep it
                    somewhere safe.
                  </p>
                </>
              )}
              {error && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!password.trim() || unlocking}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#a34536] px-4 py-3.5 text-sm font-semibold text-white transition enabled:hover:bg-[#89392d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {unlocking ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    {setup ? "Creating vault..." : "Unlocking..."}
                  </>
                ) : setup ? (
                  "Create vault"
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
    <div className="min-h-screen bg-[#f7f7f5] text-[#292c30]">
      <div className="flex min-h-screen">
        <Sidebar
          onLock={handleLock}
          onLogout={handleLogout}
          favoritesActive={filter === "favorites"}
          onFavorites={() => setFilter("favorites")}
          onAll={() => {
            setFilter("all");
            router.replace("/vault");
          }}
        />

        <main aria-busy={loading} className="min-w-0 flex-1">
          {/* Topbar now lives inside main, so its desktop variant is
              scoped to this column's width instead of the full viewport. */}
          <Topbar onLock={handleLock} />

          <div className="mx-auto max-w-[1450px] px-5 py-6 sm:px-8 lg:px-10">
            <section className="mb-7">
              <p className="text-sm font-medium text-slate-400">
                Your vault
              </p>

              <h2 className="mt-1 text-3xl font-medium tracking-tight sm:text-4xl">
                Saved credentials
              </h2>

              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Manage your passwords and sensitive credentials from one secure
                vault.
              </p>
            </section>

            <div className="mb-8">
              <SecurityScore
                score={securityScore}
                totalCredentials={
                  vaultItems.filter((item) => !item.deletedAt).length
                }
              />
            </div>

            <p role="status" className="mb-3 text-sm text-slate-600">
              {notice}
            </p>
            <SearchBar
              value={search}
              onChange={setSearch}
              onAdd={() => router.push("/vault/new")}
            />

            {filter === "trash" && (
              <p className="mb-4 text-sm text-slate-500">
                Trash stays encrypted until you permanently delete it. There is
                no automatic deletion.
              </p>
            )}
            <div className="mb-6 flex gap-2" role="group" aria-label="Vault sections">
              {(
                [
                  ["all", "All"],
                  ["favorites", "Favorites"],
                  ["trash", "Trash"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`rounded-full px-5 py-2 text-xs font-semibold transition ${filter === value ? "bg-[#a34536] text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mb-4">
              <h3 className="text-lg font-medium">
                {filter === "trash"
                  ? "Recently deleted"
                  : filter === "favorites"
                    ? "Your favorites"
                    : "Your credentials"}
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

                <h3 className="mt-4 text-base font-medium text-slate-900">
                  Something went wrong
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  We couldn&apos;t load your vault. Please try again.
                </p>

                <button
                  type="button"
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="mt-5 rounded-xl bg-[#292c30] px-4 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-[#11183d]"
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

                <h3 className="mt-4 text-base font-medium text-slate-900">
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
                  className="mt-5 rounded-xl bg-[#292c30] px-4 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-[#11183d]"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <VaultGrid
                key={`${filter}:${search}`}
                onView={setDetailId}
                onFavorite={(item) => void toggleFavorite(item)}
                favoritePending={favoritePending}
                items={filteredItems}
                showPasswords={showPasswords}
                onTogglePassword={togglePassword}
                onDelete={setDeleteTarget}
              />
            )}
          </div>
        </main>
      </div>

      {detailId && vaultItems.find((item) => item.id === detailId) && (
        <CredentialDetails
          item={vaultItems.find((item) => item.id === detailId)!}
          onRestore={(changes) =>
            void restoreCredential(
              vaultItems.find((item) => item.id === detailId)!,
              changes,
            )
          }
          busy={favoritePending !== null}
          onClose={() => setDetailId(null)}
          onFavorite={() =>
            void toggleFavorite(
              vaultItems.find((item) => item.id === detailId)!,
            )
          }
        />
      )}
      <DeleteModal
        item={deleteTarget}
        error={deleteError}
        deleting={deleting}
        onClose={() => {
          if (!deleting) {
            setDeleteError("");
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleDelete}
      />
    </div>
  );
}
