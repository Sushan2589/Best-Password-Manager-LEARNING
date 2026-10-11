import { lockPolicySchema, type SessionRequest, type SessionReply } from "../messaging/session";

export function createSessionBridge(browser: typeof chrome = chrome) {
  let creating: Promise<void> | null = null;
  async function exists() {
    return (await browser.runtime.getContexts({ contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [browser.runtime.getURL("offscreen.html")] })).length > 0;
  }
  async function ensure() {
    if (await exists()) return;
    if (!creating) creating = browser.offscreen.createDocument({ url: "offscreen.html", reasons: [browser.offscreen.Reason.WORKERS],
      justification: "Run a dedicated Argon2 and AES vault crypto Worker; retain non-extractable key only in worker memory during a bounded unlocked session." }).finally(() => { creating = null; });
    await creating;
  }
  async function send(request: SessionRequest): Promise<SessionReply> {
    try {
      // Never create a vault owner merely to lock it or poll a locked session.
      if (request.type === "session/lock" && !await exists()) return { ok: true, view: { state: { status: "locked", count: 0, error: null }, items: [], deadline: 0, policy: 5 } };
      await ensure();
      // Document creation can finish before its module installs the listener.
      // Retry only this harmless readiness probe, never a password or write.
      let ready = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        try { ready = (await browser.runtime.sendMessage({ target: "vault-owner", ping: true }))?.ready === true; } catch { /* Not ready yet. */ }
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!ready) return { ok: false, error: "unavailable" };
      const stored = await browser.storage.local.get("lockPolicy");
      const policy = lockPolicySchema.safeParse(stored.lockPolicy);
      const result: SessionReply = await browser.runtime.sendMessage({ target: "vault-owner", request,
        ...(request.type === "session/view" ? { policy: policy.success ? policy.data : 5 } : {}) });
      if (request.type === "session/policy" && result.ok) await browser.storage.local.set({ lockPolicy: request.policy });
      return result;
    } catch { return { ok: false, error: "unavailable" }; }
  }
  return { send };
}
