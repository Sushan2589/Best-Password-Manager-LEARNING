import { DEFAULT_LOCK_POLICY, lockPolicySchema, type SessionRequest, type SessionReply } from "../messaging/session";

export function createSessionBridge(browser: typeof chrome = chrome) {
  let creating: Promise<void> | null = null;
  let closing: Promise<void> | null = null;
  let epoch = 0;
  async function exists() {
    return (await browser.runtime.getContexts({ contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [browser.runtime.getURL("offscreen.html")] })).length > 0;
  }
  async function ensure(started: number) {
    const present = await exists();
    if (started !== epoch) throw new Error("Vault owner was destroyed");
    if (present) return;
    if (!creating) creating = browser.offscreen.createDocument({ url: "offscreen.html", reasons: [browser.offscreen.Reason.WORKERS],
      justification: "Run a dedicated Argon2 and AES vault crypto Worker; retain the non-extractable key only in memory until the selected lock policy or browser closure." }).finally(() => { creating = null; });
    await creating;
  }
  async function send(request: SessionRequest): Promise<SessionReply> {
    const started = epoch;
    try {
      await closing;
      if (started !== epoch) return { ok: false, error: "unavailable" };
      // Never create a vault owner merely to lock it or poll a locked session.
      if (request.type === "session/lock" && !await exists()) return { ok: true, view: { state: { status: "locked", count: 0, error: null }, items: [], deadline: 0, policy: DEFAULT_LOCK_POLICY } };
      if (started !== epoch) return { ok: false, error: "unavailable" };
      await ensure(started);
      // Document creation can finish before its module installs the listener.
      // Retry only this harmless readiness probe, never a password or write.
      let ready = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        if (started !== epoch) return { ok: false, error: "unavailable" };
        try { ready = (await browser.runtime.sendMessage({ target: "vault-owner", ping: true }))?.ready === true; } catch { /* Not ready yet. */ }
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!ready) return { ok: false, error: "unavailable" };
      const stored = await browser.storage.local.get("lockPolicy");
      const policy = lockPolicySchema.safeParse(stored.lockPolicy);
      if (started !== epoch) return { ok: false, error: "unavailable" };
      const result: SessionReply = await browser.runtime.sendMessage({ target: "vault-owner", request,
        ...(request.type === "session/view" ? { policy: policy.success ? policy.data : DEFAULT_LOCK_POLICY } : {}) });
      if (started !== epoch) return { ok: false, error: "unavailable" };
      if (request.type === "session/policy" && result.ok) await browser.storage.local.set({ lockPolicy: request.policy });
      return result;
    } catch { return { ok: false, error: "unavailable" }; }
  }
  function destroy() {
    ++epoch; // Invalidate pending unlocks and replies before any asynchronous work.
    if (!closing) closing = (async () => {
      await creating?.catch(() => {});
      if (await exists()) await browser.offscreen.closeDocument();
    })().finally(() => { closing = null; });
    return closing;
  }
  return { send, destroy };
}
