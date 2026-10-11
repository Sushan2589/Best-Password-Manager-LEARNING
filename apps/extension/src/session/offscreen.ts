import type { SessionReply } from "../messaging/session";

const worker = new Worker(new URL("./crypto.worker.ts", import.meta.url), { type: "module" });
const pending = new Map<string, (result: SessionReply) => void>();
worker.onmessage = event => {
  if (event.data?.apiId && event.data.api) {
    const apiId = event.data.apiId;
    void chrome.runtime.sendMessage({ type: "owner/api", request: event.data.api }).then(result => {
      worker.postMessage({ apiId, result });
    }).catch(() => worker.postMessage({ apiId, result: { ok: false, error: "unavailable" } }));
    return;
  }
  if (event.data?.changed) {
    void chrome.runtime.sendMessage({ type: "session/changed", status: event.data.status }).catch(() => {});
    return;
  }
  const resolve = pending.get(event.data?.id);
  if (resolve) { pending.delete(event.data.id); resolve(event.data.result); }
};
worker.onerror = event => {
  event.preventDefault();
  worker.terminate();
  for (const resolve of pending.values()) resolve({ ok: false, error: "unavailable" });
  pending.clear();
  void chrome.runtime.sendMessage({ type: "session/destroyed" }).catch(() => {});
  void chrome.runtime.sendMessage({ type: "owner/failed" }).catch(() => {});
};
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  // Only the packaged background worker can forward to the crypto owner.
  if (message?.target !== "vault-owner" || sender.id !== chrome.runtime.id || sender.tab ||
    sender.url && sender.url !== chrome.runtime.getURL("background.js")) return false;
  if (message.ping === true) { reply({ ready: true }); return false; }
  const id = crypto.randomUUID();
  const timeout = setTimeout(() => { pending.delete(id); reply({ ok: false, error: "unavailable" }); }, 90000);
  pending.set(id, result => { clearTimeout(timeout); reply(result); });
  worker.postMessage({ id, request: message.request, policy: message.policy });
  return true;
});
