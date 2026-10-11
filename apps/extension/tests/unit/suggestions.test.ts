import { describe, expect, it, vi } from "vitest";
import { createSuggestions } from "../../src/background/suggestions";
import type { SessionReply, SessionRequest } from "../../src/messaging/session";

function setup() {
  const origin = "https://github.com";
  const tab = { id: 1, active: true, windowId: 3, url: `${origin}/login`, status: "complete" };
  const form = { index: 1, signature: "focused-form", label: "Login form 2" };
  const browser = { runtime: { id: "trusted", getURL: (path: string) => `chrome-extension://trusted/${path}` },
    tabs: { get: vi.fn().mockResolvedValue(tab), sendMessage: vi.fn().mockResolvedValue(undefined) }, permissions: { contains: vi.fn().mockResolvedValue(true) },
    storage: { local: { get: vi.fn().mockResolvedValue({ inlineOrigins: [origin] }) } },
    scripting: { executeScript: vi.fn().mockImplementation(async options => [{ frameId: 0, documentId: "parent-document", result:
      options.args[0].mode === "fill" ? { ok: true, filled: true } : { ok: true, forms: [form] } }]) } };
  const item = { id: "00000000-0000-4000-8000-000000000002", title: "GitHub", username: "public-user", password: "public-password", website: origin,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const session = vi.fn<(request: SessionRequest) => Promise<SessionReply>>().mockImplementation(async request => ({ ok: true, authorized: true,
    view: { state: { status: "unlocked", count: 2, error: null }, policy: 5, deadline: Date.now() + 300000,
      items: [item, { ...item, website: "https://github.com.evil.com", title: "Unrelated" }] }, entry: request.type === "session/entry" ? { ...item } : undefined }));
  const open = vi.fn().mockResolvedValue(undefined);
  const broker = createSuggestions(session, open, browser as unknown as typeof chrome);
  const content = { id: "trusted", frameId: 0, documentId: "parent-document", origin, url: tab.url, tab: { id: 1 } } as chrome.runtime.MessageSender;
  async function prepare() {
    const result = await broker.handle({ type: "suggestions/prepare" }, content);
    const request = (result as { request: string }).request;
    const sender = { id: "trusted", frameId: 4, documentId: "picker-document", url: `chrome-extension://trusted/suggestions.html?request=${request}`, tab: { id: 1 } } as chrome.runtime.MessageSender;
    return { request, sender, message: { type: "suggestions/choose", request, id: item.id } };
  }
  return { browser, broker, content, prepare, tab, session, item, open };
}

describe("field suggestion boundary", () => {
  it("global mode offers only exact-site accounts without requiring an individual site opt-in", async () => {
    const { broker, prepare, browser } = setup();
    browser.storage.local.get.mockResolvedValue({ inlineAllSites: true, inlineOrigins: [] } as never);
    const { sender, request } = await prepare();
    expect(await broker.handle({ type: "suggestions/view", request }, sender)).toMatchObject({ ok: true, accounts: [{ title: "GitHub" }] });
  });
  it("returns only a ticket to the content script and matching metadata to the extension iframe", async () => {
    const { broker, prepare, browser } = setup(); const { request, sender } = await prepare();
    const reply = await broker.handle({ type: "suggestions/view", request }, sender);
    expect(reply).toEqual({ ok: true, locked: false, accounts: [{ id: "00000000-0000-4000-8000-000000000002", title: "GitHub", username: "public-user" }] });
    expect(JSON.stringify(reply)).not.toContain("public-password");
    expect(browser.scripting.executeScript.mock.calls[0]![0].args).toEqual([{ mode: "probe", origin: "https://github.com", focusedOnly: true }]);
  });
  it("fills both fields of the focused form in the pinned parent document, and consumes the ticket", async () => {
    const { broker, browser, prepare } = setup(); const { sender, message } = await prepare();
    expect(await broker.handle(message, sender)).toEqual({ ok: true });
    expect(browser.scripting.executeScript.mock.calls.at(-1)![0]).toMatchObject({ target: { tabId: 1, documentIds: ["parent-document"] }, world: "ISOLATED",
      args: [{ mode: "fill", index: 1, signature: "focused-form", username: "public-user", password: "public-password" }] });
    expect(await broker.handle(message, sender)).toEqual({ ok: false });
  });
  it.each(["content-script", "different-tab", "different-frame", "different-url", "different-extension"])("rejects %s as an account picker", async condition => {
    const { broker, prepare, content, session } = setup(); const { sender, request } = await prepare();
    await broker.handle({ type: "suggestions/view", request }, sender); session.mockClear();
    if (condition === "content-script") Object.assign(sender, content);
    if (condition === "different-tab") sender.tab!.id = 2;
    if (condition === "different-frame") sender.documentId = "other-document";
    if (condition === "different-url") sender.url += "&spoof=true";
    if (condition === "different-extension") sender.id = "other";
    expect(await broker.handle({ type: "suggestions/view", request }, sender)).toEqual({ ok: false });
    expect(session).not.toHaveBeenCalled();
  });
  it.each(["http://github.com", "https://github.com.evil.com", "https://accounts.github.com", "https://github.com:8443"])("never delivers after navigation to %s", async url => {
    const { broker, prepare, tab, session } = setup(); const { sender, message } = await prepare(); tab.url = url;
    expect(await broker.handle(message, sender)).toEqual({ ok: false }); expect(session).not.toHaveBeenCalled();
  });
  it("rejects revoked grants, inactive tabs, and departed parent documents", async () => {
    for (const condition of ["grant", "active", "document"]) {
      const { broker, prepare, browser, tab, session } = setup(); const { sender, message } = await prepare();
      if (condition === "grant") browser.permissions.contains.mockResolvedValue(false);
      if (condition === "active") tab.active = false;
      if (condition === "document") browser.scripting.executeScript.mockRejectedValue(new Error("Document departed"));
      expect(await broker.handle(message, sender)).toEqual({ ok: false }); expect(session).not.toHaveBeenCalled();
    }
  });
  it("cannot resurrect a pending fill after manual lock or logout", async () => {
    const { broker, session, prepare, browser } = setup(); const { sender, message } = await prepare();
    const reply = await session({ type: "session/entry", id: message.id });
    session.mockImplementation(async () => { broker.clear(); return reply; });
    expect(await broker.handle(message, sender)).toEqual({ ok: false });
    expect(browser.scripting.executeScript.mock.calls.some(call => call[0].args[0].mode === "fill")).toBe(false);
  });
  it("never releases an unrelated credential even when an account id is forged", async () => {
    const { broker, session, prepare, item } = setup(); const { sender, message } = await prepare();
    const reply = await session({ type: "session/entry", id: message.id });
    if (reply.ok) reply.entry = { ...item, website: "https://evil.com" };
    session.mockResolvedValue(reply);
    expect(await broker.handle(message, sender)).toEqual({ ok: false });
  });
  it("worker suspension invalidates the picker without persisting account data", async () => {
    const { prepare, session, open, browser } = setup(); const { sender, request } = await prepare();
    const replacement = createSuggestions(session, open, browser as unknown as typeof chrome);
    expect(await replacement.handle({ type: "suggestions/view", request }, sender)).toEqual({ ok: false });
    expect(browser.storage.local.get).toHaveBeenCalledWith(["inlineOrigins", "inlineAllSites"]);
  });
});
