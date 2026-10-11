import { describe, expect, it, vi } from "vitest";
import { createQuickFill } from "../../src/background/quickFill";
import type { SessionReply, SessionRequest } from "../../src/messaging/session";

function setup() {
  const extensionId = "trusted";
  const origin = "https://github.com";
  const choice = { index: 0, label: "Login form 1", signature: "public-form-signature" };
  let stored: Record<string, unknown> = {};
  const tab = { id: 1, active: true, windowId: 3, url: `${origin}/login`, status: "complete" };
  const browser = { runtime: { id: extensionId, getURL: (path: string) => `chrome-extension://${extensionId}/${path}` },
    tabs: { query: vi.fn().mockResolvedValue([tab]), get: vi.fn().mockImplementation(async id => id === 9 ?
      { id: 9, url: (stored.fillRequest as { id: string } | undefined) ? `chrome-extension://${extensionId}/fill.html?request=${(stored.fillRequest as { id: string }).id}` : "about:blank" } : tab) },
    windows: { create: vi.fn().mockResolvedValue({ tabs: [{ id: 9 }] }), update: vi.fn().mockResolvedValue({}) },
    scripting: { executeScript: vi.fn().mockResolvedValue([{ frameId: 0, documentId: "original-document", result: { ok: true, forms: [choice] } }]) },
    storage: { session: { set: vi.fn().mockImplementation(async data => { stored = { ...stored, ...data }; }),
      get: vi.fn().mockImplementation(async () => stored), remove: vi.fn().mockImplementation(async () => { stored = {}; }) } } };
  const session = vi.fn<(request: SessionRequest) => Promise<SessionReply>>().mockResolvedValue({ ok: true, authorized: true,
    view: { state: { status: "unlocked", count: 1, error: null }, items: [], deadline: Date.now() + 300000, policy: 5 },
    entry: { id: "00000000-0000-4000-8000-000000000002", title: "GitHub", username: "fixture-user", password: "public-selected-password", website: origin,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } });
  const broker = createQuickFill(session, browser as unknown as typeof chrome);
  async function open() {
    await broker.open();
    const ticket = stored.fillRequest as { id: string; expires: number };
    const sender = { id: extensionId, url: `chrome-extension://${extensionId}/fill.html?request=${ticket.id}`, tab: { id: 9 } } as chrome.runtime.MessageSender;
    return { ticket, sender, message: { type: "fill/choose", request: ticket.id, id: "00000000-0000-4000-8000-000000000002", formIndex: 0 } };
  }
  return { broker, browser, session, tab, origin, open };
}

describe("quick fill target authorisation", () => {
  it("passes only the selected credential to the pinned top-level document", async () => {
    const { broker, browser, session, open } = setup(); const { sender, message } = await open();
    browser.scripting.executeScript.mockResolvedValue([{ frameId: 0, documentId: "original-document", result: { ok: true } }]);
    expect(await broker.handle(message, sender)).toEqual({ ok: true });
    expect(session).toHaveBeenCalledWith({ type: "session/entry", id: message.id });
    expect(browser.scripting.executeScript.mock.calls.at(-1)?.[0]).toMatchObject({ target: { tabId: 1, documentIds: ["original-document"] }, world: "ISOLATED",
      args: [{ mode: "fill", origin: "https://github.com", username: "fixture-user", password: "public-selected-password" }] });
    expect(await broker.handle(message, sender)).toEqual({ ok: false });
  });
  it.each(["https://github.com.evil.com/login", "http://github.com/login", "https://accounts.github.com/login", "https://github.com:8443/login"])("never delivers to %s", async url => {
    const { broker, browser, session, tab, open } = setup(); const { sender, message } = await open(); tab.url = url;
    expect(await broker.handle(message, sender)).toEqual({ ok: false }); expect(session).not.toHaveBeenCalled();
    expect(browser.scripting.executeScript).toHaveBeenCalledTimes(1);
  });
  it.each(["inactive", "expired", "wrong-ui", "wrong-origin", "wrong-frame-result", "navigation-race", "wrong-credential"])("rejects %s", async condition => {
    const { broker, browser, session, tab, open } = setup(); const { ticket, sender, message } = await open();
    if (condition === "inactive") tab.active = false;
    if (condition === "expired") ticket.expires = Date.now() - 1;
    if (condition === "wrong-ui") sender.tab!.id = 99;
    if (condition === "wrong-origin") sender.url = "https://evil.example";
    if (condition === "wrong-frame-result") browser.scripting.executeScript.mockResolvedValue([{ frameId: 1, documentId: "original-document", result: { ok: true } }]);
    if (condition === "navigation-race") browser.scripting.executeScript.mockRejectedValue(new Error("Document no longer exists"));
    if (condition === "wrong-credential") session.mockResolvedValue({ ok: true, authorized: true, view: { state: { status: "locked", count: 0, error: null }, items: [], deadline: 0, policy: 5 }, entry: null });
    expect(await broker.handle(message, sender)).toEqual({ ok: false });
  });
  it("rechecks the source tab after waiting for session authorisation", async () => {
    const { broker, browser, session, tab, open } = setup(); const { sender, message } = await open();
    session.mockImplementation(async () => { tab.url = "https://evil.example"; return { ok: true, authorized: true, view: { state: { status: "locked", count: 0, error: null }, items: [], deadline: 0, policy: 5 },
      entry: { id: message.id, title: "Fixture", username: "fixture", password: "public", website: "https://github.com", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" } }; });
    expect(await broker.handle(message, sender)).toEqual({ ok: false }); expect(browser.scripting.executeScript).toHaveBeenCalledTimes(1);
  });
  it("a replacement service worker can use the stored nonsecret ticket", async () => {
    const { browser, session, open } = setup(); const { sender, message } = await open();
    const restarted = createQuickFill(session, browser as unknown as typeof chrome);
    browser.scripting.executeScript.mockResolvedValue([{ frameId: 0, documentId: "original-document", result: { ok: true } }]);
    expect(await restarted.handle(message, sender)).toEqual({ ok: true });
    expect(JSON.stringify(browser.storage.session.set.mock.calls)).not.toContain("public-selected-password");
  });
  it("concurrent account clicks cannot replay a single fill ticket", async () => {
    const { broker, browser, session, open } = setup(); const { sender, message } = await open();
    let release!: (value: SessionReply) => void;
    const valid = await session({ type: "session/entry", id: message.id });
    session.mockClear(); session.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    browser.scripting.executeScript.mockResolvedValue([{ frameId: 0, documentId: "original-document", result: { ok: true } }]);
    const first = broker.handle(message, sender);
    await vi.waitFor(() => expect(session).toHaveBeenCalledOnce());
    expect(await broker.handle(message, sender)).toEqual({ ok: false });
    expect(await broker.handle(message, sender)).toEqual({ ok: false });
    release(valid); expect(await first).toEqual({ ok: true });
    expect(browser.scripting.executeScript).toHaveBeenCalledTimes(2);
  });
  it("cancelling the chooser while authorizing prevents credential delivery", async () => {
    const { broker, browser, session, open } = setup(); const { sender, message } = await open();
    const valid = await session({ type: "session/entry", id: message.id });
    let release!: (value: SessionReply) => void;
    session.mockClear(); session.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = broker.handle(message, sender);
    await vi.waitFor(() => expect(session).toHaveBeenCalledOnce());
    expect(await broker.handle({ type: "fill/cancel", request: message.request }, sender)).toEqual({ ok: true });
    release(valid); expect(await pending).toEqual({ ok: false });
    expect(browser.scripting.executeScript).toHaveBeenCalledTimes(1);
  });
  it("closing either bound tab clears the pending ticket", async () => {
    const { broker, open } = setup(); const { sender, message } = await open();
    await broker.cancelTab(9); expect(await broker.handle(message, sender)).toEqual({ ok: false });
  });
});
