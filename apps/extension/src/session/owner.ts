import { VaultSession } from "../popup/vault/session";
import type { VaultError } from "../popup/vault/session";
import type { AuthResult } from "../messaging/auth";
import type { LockPolicy, SessionReply, SessionRequest, SessionView } from "../messaging/session";
import { DEFAULT_LOCK_POLICY } from "../messaging/session";

// Lives in a real dedicated crypto Worker, independent of popup and MV3 worker.
export class SessionOwner {
  #idleAt = 0;
  #absoluteAt = 0;
  #expiresAt = 0;
  #policy: LockPolicy;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #epoch = 0;
  #opening: Promise<void> | null = null;
  #authError: VaultError | null = null;
  constructor(readonly vault: VaultSession, private readonly authenticate: () => Promise<AuthResult>,
    policy: LockPolicy = DEFAULT_LOCK_POLICY, private readonly now = Date.now, private readonly changed: () => void = () => {}) {
    this.#policy = policy;
    vault.subscribe(() => changed());
  }
  lock() {
    ++this.#epoch; this.#idleAt = 0; this.#absoluteAt = 0;
    this.#authError = null;
    clearTimeout(this.#timer); this.vault.lock();
  }
  #expire() {
    if (this.vault.getSnapshot().status === "unlocked" && this.now() >= this.deadline()) this.lock();
  }
  deadline() {
    // Browser mode skips local idle/one-hour limits, never the API session limit.
    return this.#policy === "browser" ? this.#expiresAt : Math.min(this.#idleAt, this.#absoluteAt, this.#expiresAt);
  }
  #schedule() {
    clearTimeout(this.#timer);
    if (this.vault.getSnapshot().status === "unlocked") this.#timer = setTimeout(() => this.#expire(), Math.max(0, this.deadline() - this.now()));
  }
  #touch() {
    this.#expire();
    if (this.vault.getSnapshot().status !== "unlocked") return;
    // Popup-only sessions still have a five-minute safety deadline.
    this.#idleAt = this.now() + (this.#policy === "browser" ? 0 : this.#policy || 5) * 60000;
    this.#schedule();
  }
  view(includeItems = true): SessionView {
    this.#expire();
    const snapshot = this.vault.getSnapshot();
    const state = snapshot.status === "locked" && !snapshot.error && this.#authError ? { ...snapshot, error: this.#authError } : snapshot;
    const items = includeItems ? this.vault.listCredentials().flatMap(item => {
      const value = this.vault.readCredential(item.id); return value ? [value] : [];
    }) : [];
    return { state, items, deadline: this.deadline(), policy: this.#policy };
  }
  async reconcile() {
    const epoch = this.#epoch;
    const result = await this.authenticate();
    if (epoch !== this.#epoch) return;
    if (!result.ok || result.state !== "signed-in" || !result.profile.emailVerified || Date.parse(result.profile.sessionExpiresAt) <= this.now()) {
      this.lock(); this.vault.setAccount(null);
      this.#authError = !result.ok ? "unavailable" : result.state === "signed-in" && !result.profile.emailVerified ? "unverified" : "unauthenticated";
      return;
    }
    this.vault.setAccount(result.profile);
    this.#authError = null;
    this.#expiresAt = Date.parse(result.profile.sessionExpiresAt);
    if (this.vault.getSnapshot().status === "locked") { this.#idleAt = 0; this.#absoluteAt = 0; }
    this.#expire();
    this.#schedule();
  }
  async handle(request: SessionRequest): Promise<SessionReply> {
    this.#expire();
    if (request.type === "session/lock") this.lock();
    if (request.type === "session/view") await this.reconcile();
    if (request.type === "session/policy") {
      if (this.#policy !== request.policy) {
        this.#policy = request.policy;
        // Reset inactivity before checking the new policy. Keep the original
        // unlock's one-hour cap when switching back from browser mode.
        this.#idleAt = this.now() + (this.#policy === "browser" ? 0 : this.#policy || 5) * 60000;
        this.#touch(); this.changed();
      }
    }
    if (request.type === "session/touch") this.#touch();
    if (request.type === "session/unlock") {
      // Serialise unlock attempts but let manual lock invalidate an in-flight one.
      if (this.#opening) return { ok: true, view: this.view() };
      const epoch = this.#epoch;
      this.#opening = (async () => {
        await this.reconcile();
        if (epoch !== this.#epoch) return;
        await this.vault.unlock(request.password);
        request.password = "";
        if (epoch !== this.#epoch || this.vault.getSnapshot().status !== "unlocked") return;
        this.#absoluteAt = this.now() + 60 * 60000;
        this.#idleAt = this.now() + (this.#policy === "browser" ? 0 : this.#policy || 5) * 60000;
        this.#touch();
      })();
      try { await this.#opening; } finally { request.password = ""; this.#opening = null; }
    }
    if (request.type === "session/authorize" || request.type === "session/entry") {
      const epoch = this.#epoch;
      const authorized = await this.vault.authorizeAction();
      this.#expire();
      const valid = authorized && epoch === this.#epoch && this.vault.getSnapshot().status === "unlocked";
      if (valid) this.#touch();
      return { ok: true, view: this.view(request.type !== "session/entry"), authorized: valid,
        ...(request.type === "session/entry" ? { entry: valid ? this.vault.readCredential(request.id) : null } : {}) };
    }
    if (request.type === "session/save") {
      const epoch = this.#epoch;
      const write = await this.vault.saveEntry(request.entry, request.itemId);
      this.#expire();
      if (epoch === this.#epoch && write.ok) this.#touch();
      return { ok: true, view: this.view(), write };
    }
    return { ok: true, view: this.view(request.type === "session/view" || request.type === "session/unlock") };
  }
}
