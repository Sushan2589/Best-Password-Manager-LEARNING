import type { DecryptedVaultItem, VaultEntry } from "@password-manager/shared";
import type { CredentialSummary, VaultState } from "./session";
import type { LockPolicy, SessionReply, SessionRequest } from "../../messaging/session";
import type { WriteResult } from "../../messaging/write";

// The popup has temporary plaintext copies for rendering, but never the key.
export class RemoteVault {
  #state: VaultState = { status: "locked", count: 0, error: null };
  #items: DecryptedVaultItem[] = [];
  #listeners = new Set<() => void>();
  #deadline = 0;
  #epoch = 0;
  policy: LockPolicy = 5;
  constructor(private readonly transport: (request: SessionRequest) => Promise<SessionReply> = request => chrome.runtime.sendMessage(request)) {}
  getSnapshot = () => this.#state;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #publish(state: VaultState) { this.#state = state; for (const listener of this.#listeners) listener(); }
  clear = () => { ++this.#epoch; this.#items = []; this.#deadline = 0; this.#publish({ status: "locked", count: 0, error: null }); };
  #readable() { return this.#state.status === "unlocked" && this.#deadline > Date.now(); }
  async request(request: SessionRequest) {
    const epoch = this.#epoch;
    let result: SessionReply;
    try { result = await this.transport(request); } catch { result = { ok: false, error: "unavailable" }; }
    if (epoch !== this.#epoch) return { ok: false, error: "unavailable" } as const;
    if (!result?.ok) { this.clear(); this.#publish({ status: "locked", count: 0, error: "unavailable" }); return { ok: false, error: "unavailable" } as const; }
    this.policy = result.view.policy; this.#deadline = result.view.deadline;
    if (result.view.state.status !== "unlocked") this.#items = [];
    else if (["session/view", "session/unlock", "session/authorize", "session/save"].includes(request.type)) this.#items = result.view.items;
    this.#publish(result.view.state);
    return result;
  }
  refresh = () => this.request({ type: "session/view" });
  poll = () => this.request({ type: "session/status" });
  lock = () => { this.clear(); void this.request({ type: "session/lock" }); };
  async unlock(password: string) {
    this.#publish({ status: "unlocking", count: 0, error: null });
    try { await this.request({ type: "session/unlock", password }); } finally { password = ""; }
  }
  listCredentials = (): CredentialSummary[] => this.#readable() ? this.#items.map(({ id, title, username, email, website }) => ({ id, title, username, email, website })) : [];
  readCredential = (id: string) => { const item = this.#readable() ? this.#items.find(item => item.id === id) : null; return item ? { ...item } : null; };
  authorizeAction = async () => { const reply = await this.request({ type: "session/authorize" }); return reply.ok && reply.authorized === true && this.#readable(); };
  saveEntry = async (entry: VaultEntry, itemId?: string): Promise<WriteResult> => {
    const reply = await this.request({ type: "session/save", entry, ...(itemId ? { itemId } : {}) });
    return reply.ok && reply.write ? reply.write : { ok: false, error: "unavailable" };
  };
  setPolicy = (policy: LockPolicy) => this.request({ type: "session/policy", policy });
  touch = () => this.request({ type: "session/touch" });
}
