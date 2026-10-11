import { describe, expect, it, vi } from "vitest";
import { fillSelected, probeForms } from "../../src/popup/sites/autofill";
import type { DecryptedVaultItem } from "@password-manager/shared";

const target = { tabId: 1, origin: "https://github.com", documentId: "trusted-document", forms: [{ index: 0, signature: "signature", label: "Login form 1" }] };
const item: DecryptedVaultItem = { title: "GitHub", username: "fixture-user", password: "public-fixture-password", website: "https://github.com/login",
  id: "fixture", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
function browser(url = "https://github.com/login", id = 1) {
  return { tabs: { query: vi.fn().mockResolvedValue([{ id, url, status: "complete" }]) }, scripting: { executeScript: vi.fn().mockResolvedValue([{ frameId: 0, documentId: target.documentId, result: { ok: true, filled: true } }]) } };
}
describe("autofill release boundary", () => {
  it.each(["http://github.com", "https://github.com.evil.com", "https://accounts.github.com", "chrome://settings"])("sends no credentials to %s", async url => {
    const api = browser(url);
    await expect(fillSelected(target, target.forms[0]!, () => item, async () => true, api as never)).rejects.toThrow();
    expect(api.scripting.executeScript).not.toHaveBeenCalled();
  });
  it("rejects tab changes, locked reads, and expired authorization", async () => {
    for (const [api, read, authorize] of [[browser(undefined, 2), () => item, async () => true], [browser(), () => null, async () => true], [browser(), () => item, async () => false]] as const) {
      await expect(fillSelected(target, target.forms[0]!, read, authorize, api as never)).rejects.toThrow();
      expect(api.scripting.executeScript).not.toHaveBeenCalled();
    }
  });
  it("targets only the probed document in the isolated world, with one selected account", async () => {
    const api = browser(); await fillSelected(target, target.forms[0]!, () => item, async () => true, api as never);
    expect(api.scripting.executeScript).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ target: { tabId: 1, documentIds: ["trusted-document"] }, world: "ISOLATED",
      args: [{ mode: "fill", origin: "https://github.com", index: 0, signature: "signature", username: item.username, password: item.password }] }));
  });
  it("fails when document injection is rejected instead of falling back to a new document", async () => {
    const api = browser(); api.scripting.executeScript.mockRejectedValue(new Error("Document departed"));
    await expect(fillSelected(target, target.forms[0]!, () => item, async () => true, api as never)).rejects.toThrow();
    expect(api.scripting.executeScript).toHaveBeenCalledOnce();
  });
  it("probes without secrets and rejects non-top-frame results", async () => {
    const api = browser(); api.scripting.executeScript.mockResolvedValue([{ frameId: 3, documentId: "child", result: { ok: true, filled: true } }]);
    await expect(probeForms(item.website, api as never)).rejects.toThrow();
    expect(api.scripting.executeScript.mock.calls[0]![0].args).toEqual([{ mode: "probe", origin: target.origin }]);
  });
});
