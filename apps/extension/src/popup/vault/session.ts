import { decrypt, deriveCryptoKey } from "@password-manager/crypto";
import { vaultEntrySchema, type DecryptedVaultItem } from "@password-manager/shared";
import type { AuthResult, Profile } from "../../messaging/auth";
import type { VaultApiError, VaultResult } from "../../messaging/vault";

export type VaultError = VaultApiError | "empty-vault" | "unlock-failed";
export type VaultState = { status: "locked" | "unlocking" | "unlocked"; count: number; error: VaultError | null };
export type CredentialSummary = Pick<DecryptedVaultItem, "id" | "title" | "username" | "email" | "website">;
type Dependencies = { snapshot: () => Promise<VaultResult>; validateSession: () => Promise<AuthResult>;
  derive?: typeof deriveCryptoKey; decrypt?: typeof decrypt };

// This instance belongs to the popup, never the background service worker.
// Published state contains only counts; key and plaintext remain private.
export class VaultSession {
  #key: CryptoKey | null = null;
  #items: DecryptedVaultItem[] = [];
  #account: Profile | null = null;
  #generation = 0;
  #listeners = new Set<() => void>();
  #state: VaultState = { status: "locked", count: 0, error: null };
  constructor(private readonly dependencies: Dependencies) {}

  getSnapshot = () => this.#state;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };

  #publish(state: VaultState) { this.#state = state; for (const listener of this.#listeners) listener(); }

  setAccount(profile: Profile | null) {
    const next = profile?.emailVerified && Date.parse(profile.sessionExpiresAt) > Date.now() ? profile : null;
    if (next?.id !== this.#account?.id || !next) this.lock();
    this.#account = next;
  }

  lock = () => {
    ++this.#generation;
    this.#key = null; this.#items = [];
    this.#publish({ status: "locked", count: 0, error: null });
  };

  async unlock(password: string): Promise<void> {
    if (this.#state.status !== "locked") return;
    const accountId = this.#account?.id;
    if (!accountId || !password || password.length > 1024) return;
    const generation = ++this.#generation;
    const current = () => {
      if (generation !== this.#generation || this.#account?.id !== accountId) return false;
      if (Date.parse(this.#account.sessionExpiresAt) <= Date.now()) { this.lock(); return false; }
      return true;
    };
    this.#publish({ status: "unlocking", count: 0, error: null });
    let failure: VaultError = "unlock-failed";
    try {
      const result = await this.dependencies.snapshot();
      if (!current()) return;
      if (!result.ok) { failure = result.error; throw new Error("Vault unavailable."); }
      if (result.snapshot.profile.id !== accountId) { failure = "account-changed"; throw new Error("Account changed."); }
      if (result.snapshot.items.length === 0) { failure = "empty-vault"; throw new Error("No password verifier."); }
      const key = await (this.dependencies.derive ?? deriveCryptoKey)(password, result.snapshot.vaultSalt);
      password = "";
      if (!current()) return;
      const items: DecryptedVaultItem[] = [];
      for (const item of result.snapshot.items) {
        const plaintext = await (this.dependencies.decrypt ?? decrypt)(item.cipherText, item.nonce, key);
        if (!current()) return;
        const credential = vaultEntrySchema.parse(JSON.parse(plaintext));
        // Metadata comes from the envelope, never from decrypted JSON.
        items.push({ ...credential, id: item.id, createdAt: item.createdAt, updatedAt: item.updatedAt });
      }
      const confirmed = await this.dependencies.validateSession();
      if (!current()) return;
      if (!confirmed.ok) { failure = "unavailable"; throw new Error("Session unavailable."); }
      if (confirmed.state !== "signed-in") { failure = "unauthenticated"; throw new Error("Session ended."); }
      if (!confirmed.profile.emailVerified) { failure = "unverified"; throw new Error("Verification required."); }
      if (confirmed.profile.id !== accountId) { failure = "account-changed"; throw new Error("Account changed."); }
      if (Date.parse(confirmed.profile.sessionExpiresAt) <= Date.now()) { failure = "unauthenticated"; throw new Error("Session expired."); }
      this.#key = key; this.#items = items;
      this.#publish({ status: "unlocked", count: this.#items.length, error: null });
    } catch {
      if (current()) {
        this.#key = null; this.#items = [];
        this.#publish({ status: "locked", count: 0, error: failure });
      }
    } finally { password = ""; }
  }

  // Reveals only a boolean for lifecycle validation, never a key or plaintext.
  hasKey(): boolean { return this.#key !== null; }

  #canRead(): boolean {
    return this.#state.status === "unlocked" && this.#key !== null && this.#account !== null &&
      this.#account.emailVerified && Date.parse(this.#account.sessionExpiresAt) > Date.now();
  }

  listCredentials = (): CredentialSummary[] => {
    if (!this.#canRead()) return [];
    return this.#items.map(({ id, title, username, email, website }) => ({ id, title, username, email, website }));
  };

  readCredential = (id: string): DecryptedVaultItem | null => {
    if (!this.#canRead()) return null;
    const item = this.#items.find(entry => entry.id === id);
    return item ? { ...item } : null;
  };
}
