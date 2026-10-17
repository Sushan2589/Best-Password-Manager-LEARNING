import { describe, expect, it, vi } from "vitest";
import { registerBrowserLock } from "../../src/background/browserLock";
import { createSessionBridge } from "../../src/background/session";

describe("browser window boundary", () => {
  it.each([0, 1, 2])("destroys the owner only when %i normal windows remain", async remaining => {
    let removed!: () => void;
    const clear = vi.fn().mockResolvedValue(undefined);
    const getAll = vi.fn().mockResolvedValue(Array.from({ length: remaining }, () => ({ type: "normal" })));
    registerBrowserLock(clear, { windows: { onRemoved: { addListener: (listener: () => void) => { removed = listener; } }, getAll } } as unknown as typeof chrome);
    removed();
    await vi.waitFor(() => expect(getAll).toHaveBeenCalledWith({ windowTypes: ["normal"] }));
    expect(clear).toHaveBeenCalledTimes(remaining === 0 ? 1 : 0);
  });
  it("fails closed if the window query fails", async () => {
    let removed!: () => void;
    const clear = vi.fn().mockResolvedValue(undefined);
    registerBrowserLock(clear, { windows: { onRemoved: { addListener: (listener: () => void) => { removed = listener; } }, getAll: vi.fn().mockRejectedValue(new Error("closed")) } } as unknown as typeof chrome);
    removed(); await vi.waitFor(() => expect(clear).toHaveBeenCalledOnce());
  });
});

function bridgeFixture() {
  let present = true;
  const sendMessage = vi.fn().mockImplementation(async (message: { ping?: boolean }) => message.ping ? { ready: true } : { ok: true, view: { state: { status: "locked", count: 0, error: null }, items: [], deadline: 0, policy: 15 } });
  const closeDocument = vi.fn().mockImplementation(async () => { present = false; });
  const createDocument = vi.fn().mockImplementation(async () => { present = true; });
  const browser = {
    runtime: { ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" }, getURL: (path: string) => path,
      getContexts: vi.fn().mockImplementation(async () => present ? [{}] : []), sendMessage },
    offscreen: { Reason: { WORKERS: "WORKERS" }, closeDocument, createDocument },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } },
  };
  return { browser, bridge: createSessionBridge(browser as unknown as typeof chrome), sendMessage, closeDocument, createDocument };
}

describe("owner destruction", () => {
  it("closes memory without creating a replacement or storing secrets", async () => {
    const { bridge, closeDocument, createDocument, browser } = bridgeFixture();
    await bridge.destroy(); await bridge.destroy();
    expect(closeDocument).toHaveBeenCalledOnce(); expect(createDocument).not.toHaveBeenCalled();
    expect(browser.storage.local.set).not.toHaveBeenCalled();
  });
  it("drops a pending unlock reply after browser closure", async () => {
    const { bridge, sendMessage } = bridgeFixture();
    let release!: (reply: unknown) => void;
    sendMessage.mockImplementation(async (message: { ping?: boolean }) => message.ping ? { ready: true } : new Promise(resolve => { release = resolve; }));
    const pending = bridge.send({ type: "session/unlock", password: "fixture-only" });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await bridge.destroy();
    release({ ok: true, view: { state: { status: "unlocked", count: 1, error: null }, items: [{ password: "must-be-discarded" }], deadline: Date.now() + 60000, policy: "browser" } });
    expect(await pending).toEqual({ ok: false, error: "unavailable" });
  });
  it.each([undefined, 999, "browser", 0, 5, 15, 30])("applies a valid stored policy or the fifteen-minute default (%s)", async policy => {
    const { bridge, browser, sendMessage } = bridgeFixture();
    browser.storage.local.get.mockResolvedValue({ lockPolicy: policy } as never);
    await bridge.send({ type: "session/view" });
    expect(sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ policy: policy === undefined || policy === 999 ? 15 : policy }));
  });
});
