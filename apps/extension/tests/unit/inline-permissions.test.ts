import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_HTTPS_SITES, inlineSiteAllowed, syncInlineScripts } from "../../src/background/inlinePermissions";

function browser(settings: Record<string, unknown>, grant = true) {
  return { storage: { local: { get: vi.fn().mockResolvedValue(settings) } }, permissions: { contains: vi.fn().mockResolvedValue(grant) },
    scripting: { getRegisteredContentScripts: vi.fn().mockResolvedValue([{ id: "inline-0" }]), unregisterContentScripts: vi.fn().mockResolvedValue(undefined), registerContentScripts: vi.fn().mockResolvedValue(undefined) } };
}
afterEach(() => vi.unstubAllGlobals());
describe("global and site-only suggestion permissions", () => {
  it("allows new HTTPS sites after a single global opt-in, without storing each hostname", async () => {
    const api = browser({ inlineAllSites: true, inlineOrigins: [] });
    expect(await inlineSiteAllowed("https://accounts.google.com", api as never)).toBe(true);
    expect(await inlineSiteAllowed("https://www.facebook.com", api as never)).toBe(true);
    expect(api.permissions.contains).toHaveBeenCalledWith({ origins: ["https://accounts.google.com/*"] });
  });
  it("rejects withheld/revoked site access even when global suggestions are enabled", async () => {
    expect(await inlineSiteAllowed("https://github.com", browser({ inlineAllSites: true }, false) as never)).toBe(false);
  });
  it("keeps existing site-only opt-ins and denies other sites by default", async () => {
    const api = browser({ inlineOrigins: ["https://github.com"] });
    expect(await inlineSiteAllowed("https://github.com", api as never)).toBe(true);
    expect(await inlineSiteAllowed("https://www.github.com", api as never)).toBe(false);
    expect(await inlineSiteAllowed("https://evil.com", api as never)).toBe(false);
  });
  it.each(["http://github.com", "https://github.com/path", "chrome://settings"])("rejects an invalid/non-HTTPS origin: %s", async origin => {
    await expect(inlineSiteAllowed(origin, browser({ inlineAllSites: true }) as never)).rejects.toThrow();
  });
  it("registers one top-level isolated script across HTTPS sites only after broad access is granted", async () => {
    const api = browser({ inlineAllSites: true, inlineOrigins: ["https://github.com"] }); vi.stubGlobal("chrome", api);
    await syncInlineScripts();
    expect(api.scripting.registerContentScripts).toHaveBeenCalledExactlyOnceWith([{ id: "inline-0", matches: [ALL_HTTPS_SITES], js: ["inline.js"], runAt: "document_idle", allFrames: false, persistAcrossSessions: true, world: "ISOLATED" }]);
  });
  it("unregisters scripts after broad access is revoked rather than silently retaining global injection", async () => {
    const api = browser({ inlineAllSites: true, inlineOrigins: [] }, false); vi.stubGlobal("chrome", api);
    await syncInlineScripts(); expect(api.scripting.unregisterContentScripts).toHaveBeenCalledWith({ ids: ["inline-0"] });
    expect(api.scripting.registerContentScripts).not.toHaveBeenCalled();
  });
});
