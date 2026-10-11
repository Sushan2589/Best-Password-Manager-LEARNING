import { checkConnection } from "../api/connection";
import { API_ORIGIN } from "../config/runtime";
import { handleMessage } from "./handler";
import { createAuthApi } from "../api/auth";
import { createVaultApi } from "../api/vault";
import { createVaultWriter } from "../api/write";
import { createCaptureBroker } from "./capture";
import { isAuthResult } from "../messaging/auth";
import { sessionRequestSchema, trustedVaultUi } from "../messaging/session";
import { createSessionBridge } from "./session";
import { createQuickFill } from "./quickFill";
import { createSuggestions } from "./suggestions";
import { syncInlineScripts, websitePermission, inlineSiteAllowed, ALL_HTTPS_SITES } from "./inlinePermissions";

const auth = createAuthApi(API_ORIGIN);
const vault = createVaultApi(API_ORIGIN);
const write = createVaultWriter(API_ORIGIN);
const session = createSessionBridge();
const quickFill = createQuickFill(session.send);
const suggestions = createSuggestions(session.send, quickFill.open);
chrome.tabs.onRemoved.addListener(tabId => { void quickFill.cancelTab(tabId); suggestions.cancelTab(tabId); });
void chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
let syncing = Promise.resolve();
const syncInline = () => { syncing = syncing.then(syncInlineScripts).catch(() => {}); };
syncInline();
chrome.permissions.onAdded.addListener(syncInline);
chrome.permissions.onRemoved.addListener(syncInline);
chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll().then(() => chrome.contextMenus.create({ id: "fill-login", title: "Fill with Password Manager", contexts: ["page", "editable"], documentUrlPatterns: ["https://*/*"] }));
});
chrome.commands.onCommand.addListener(command => { if (command === "fill-login") void quickFill.open(); });
chrome.contextMenus.onClicked.addListener((info, tab) => { if (info.menuItemId === "fill-login" && (info.frameId ?? 0) === 0) void quickFill.open(tab?.id); });
void chrome.action.setBadgeText({ text: "" });
const capture = createCaptureBroker(auth, chrome, available => {
  void chrome.action.setBadgeText({ text: available ? "1" : "" });
  void chrome.action.setBadgeBackgroundColor({ color: "#c45b48" });
});

// Register synchronously on every worker start. The vault key belongs only to
// the dedicated crypto worker; stored chooser tickets contain no credentials.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (message && typeof message === "object" && ("target" in message && message.target === "vault-owner" || "type" in message && ["session/changed", "session/destroyed"].includes(String(message.type)))) return false;
  const popup = trustedVaultUi(sender, chrome.runtime.id);
  const type = message && typeof message === "object" && "type" in message ? message.type : null;
  if (type === "owner/failed") {
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("offscreen.html") || sender.tab) { sendResponse({ ok: false }); return false; }
    void chrome.offscreen.closeDocument().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (type === "owner/api") {
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("offscreen.html") || sender.tab || !message || typeof message !== "object" || !("request" in message)) { sendResponse({ ok: false, error: "forbidden" }); return false; }
    const request = message.request;
    if (!request || typeof request !== "object" || !("type" in request) || !["auth/session", "vault/snapshot", "vault/write"].includes(String(request.type))) { sendResponse({ ok: false, error: "forbidden" }); return false; }
    void handleMessage(request, { id: chrome.runtime.id, url: chrome.runtime.getURL("popup.html") }, chrome.runtime.id, chrome.runtime.getURL("popup.html"),
      () => checkConnection(API_ORIGIN), auth, vault, write).then(sendResponse);
    return true;
  }
  if (typeof type === "string" && type.startsWith("session/")) {
    const parsed = sessionRequestSchema.safeParse(message);
    if (!popup || !parsed.success || parsed.data.type === "session/entry") { sendResponse({ ok: false, error: "forbidden" }); return false; }
    if (parsed.data.type === "session/lock") { capture.clear(); void quickFill.clear(); suggestions.clear(); }
    void session.send(parsed.data).then(sendResponse).catch(() => sendResponse({ ok: false, error: "unavailable" }));
    return true;
  }
  if (typeof type === "string" && type.startsWith("suggestions/")) {
    void suggestions.handle(message, sender).then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (type === "inline/open") {
    if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab?.id || !sender.documentId || !sender.origin?.startsWith("https://") || sender.origin !== new URL(sender.url ?? "about:blank").origin) { sendResponse({ ok: false }); return false; }
    void (async () => {
      const allowed = await inlineSiteAllowed(sender.origin!);
      if (allowed) return quickFill.open(sender.tab!.id, sender.documentId);
    })().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (typeof type === "string" && type.startsWith("fill/")) {
    if (!popup) { sendResponse({ ok: false }); return false; }
    void quickFill.handle(message, sender).then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (type === "inline/all-sites") {
    if (!popup || !message || typeof message !== "object" || !("enabled" in message) || typeof message.enabled !== "boolean" || Object.keys(message).some(key => !["type", "enabled"].includes(key))) { sendResponse({ ok: false }); return false; }
    const enabled = message.enabled;
    void (async () => {
      if (enabled && !await chrome.permissions.contains({ origins: [ALL_HTTPS_SITES] })) return { ok: false };
      // Capture tab IDs before revoking access, which hides their URLs.
      const tabs = await chrome.tabs.query(enabled ? { url: ALL_HTTPS_SITES } : {});
      suggestions.clear();
      if (enabled) await chrome.storage.local.set({ inlineAllSites: true });
      else await chrome.storage.local.set({ inlineAllSites: false, inlineOrigins: [] });
      let accessRevoked = true;
      if (!enabled) {
        try { accessRevoked = await chrome.permissions.remove({ origins: [ALL_HTTPS_SITES] }); }
        catch { accessRevoked = false; }
      }
      syncInline(); await syncing;
      // Existing tabs receive the change immediately. Browser restrictions may
      // prevent injection on a particular tab; future allowed navigations work.
      await Promise.allSettled(tabs.map(tab => !tab.id ? Promise.resolve() : enabled ?
        chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: "ISOLATED", files: ["inline.js"] }) :
        chrome.tabs.sendMessage(tab.id, { type: "inline/stop" }, { frameId: 0 })));
      return enabled ? { ok: true } : { ok: true, accessRevoked };
    })().then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (type === "inline/settings") {
    if (!popup || !message || typeof message !== "object" || !("origin" in message) || typeof message.origin !== "string" || !("enabled" in message) || typeof message.enabled !== "boolean") { sendResponse({ ok: false }); return false; }
    const { origin, enabled } = message;
    void (async () => {
      const pattern = websitePermission(origin);
      if (enabled && !await chrome.permissions.contains({ origins: [pattern] })) return { ok: false };
      const stored = await chrome.storage.local.get("inlineOrigins");
      const origins: string[] = Array.isArray(stored.inlineOrigins) ? stored.inlineOrigins : [];
      await chrome.storage.local.set({ inlineOrigins: enabled ? [...new Set([...origins, origin])] : origins.filter(value => value !== origin) });
      syncInline(); await syncing;
      if (enabled) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id && new URL(tabs[0].url ?? "about:blank").origin === origin) await chrome.scripting.executeScript({ target: { tabId: tabs[0].id, frameIds: [0] }, world: "ISOLATED", files: ["inline.js"] });
      } else {
        suggestions.clear();
        // Remove already-injected controls as well as future registrations.
        const tabs = await chrome.tabs.query({ url: pattern });
        await Promise.allSettled(tabs.map(tab => tab.id ? chrome.tabs.sendMessage(tab.id, { type: "inline/stop" }, { frameId: 0 }) : Promise.resolve()));
        // Required API host access must remain; revoke this optional website grant.
        if (pattern !== `${new URL(API_ORIGIN).protocol}//${new URL(API_ORIGIN).hostname}/*`) await chrome.permissions.remove({ origins: [pattern] });
      }
      return { ok: true };
    })().then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message && typeof message === "object" && "type" in message && typeof message.type === "string" && message.type.startsWith("capture/")) {
    if (sender.id !== chrome.runtime.id) { sendResponse({ ok: false }); return false; }
    void capture.handle(message, sender, popup).then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (popup && message && typeof message === "object" && "type" in message && ["auth/logout", "auth/login"].includes(String(message.type))) {
    capture.clear(); void quickFill.clear(); suggestions.clear();
    void session.send({ type: "session/lock" });
  }
  void handleMessage(message, sender, chrome.runtime.id, popup ? sender.url! : chrome.runtime.getURL("popup.html"),
    () => checkConnection(API_ORIGIN), auth, vault, write).then(result => {
      if (popup && message && typeof message === "object" && "type" in message && message.type === "auth/session" && isAuthResult(result)) capture.reconcile(result);
      sendResponse(result);
    });
  return true;
});
