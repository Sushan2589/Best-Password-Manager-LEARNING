import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveApiOrigin } from "../../src/config/origin";
import { createManifest } from "../../manifest";
import { checkConnection } from "../../src/api/connection";
import { handleMessage } from "../../src/background/handler";
import { isConnectionResult } from "../../src/messaging/protocol";

afterEach(() => vi.useRealTimers());

describe("API origin configuration", () => {
  it("defaults only development builds to loopback", () => {
    expect(resolveApiOrigin(undefined, true)).toBe("http://localhost:3001");
    expect(() => resolveApiOrigin(undefined, false)).toThrow();
  });
  it("normalizes valid HTTPS origins", () => {
    expect(resolveApiOrigin("https://API.example.com:443/", false)).toBe("https://api.example.com");
  });
  it.each([
    "http://api.example.com", "http://localhost:3001", "https://user:pass@api.example.com",
    "https://api.example.com/path", "https://api.example.com?token=secret", "https://api.example.com#fragment",
    "file:///tmp/api", "javascript:alert(1)", "not-an-origin",
  ])("rejects unsafe production configuration: %s", value => {
    expect(() => resolveApiOrigin(value, false)).toThrow();
  });
  it("rejects non-loopback HTTP even in development", () => {
    expect(() => resolveApiOrigin("http://localhost.evil.com:3001", true)).toThrow();
  });
});

describe("manifest permissions", () => {
  it("restricts network access and includes no storage or website permissions", () => {
    const manifest = createManifest("https://api.example.com:8443");
    expect(manifest.host_permissions).toEqual(["https://api.example.com/*"]);
    expect(manifest.content_security_policy.extension_pages).toContain("connect-src https://api.example.com:8443;");
    expect(manifest.permissions).toEqual(["activeTab"]);
    expect(manifest).not.toHaveProperty("content_scripts");
    expect(manifest).not.toHaveProperty("externally_connectable");
    expect(manifest.content_security_policy.extension_pages).not.toContain("'unsafe-eval'");
    expect(manifest.content_security_policy.extension_pages).toContain("'wasm-unsafe-eval'");
  });
});

describe("connection probe", () => {
  it.each([[200, "reachable"], [401, "no-session"], [403, "restricted"]] as const)(
    "returns a sanitized status for HTTP %s", async (status, state) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ email: "private@example.com", vaultSalt: "private" }), {
        status, headers: { "content-type": "application/json" },
      }));
      expect(await checkConnection("https://api.example.com", fetcher)).toEqual({ ok: true, state });
      expect(fetcher).toHaveBeenCalledWith("https://api.example.com/user/me", expect.objectContaining({
        method: "GET", credentials: "include", redirect: "error", cache: "no-store",
      }));
    },
  );
  it("rejects successful HTML responses instead of reporting an API connection", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>wrong server</html>", { headers: { "content-type": "text/html" } }));
    expect(await checkConnection("https://api.example.com", fetcher)).toEqual({ ok: false, error: "invalid-response" });
  });
  it("does not expose network errors or server response bodies", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private server details"));
    expect(await checkConnection("https://api.example.com", fetcher)).toEqual({ ok: false, error: "unavailable" });
  });
  it("handles server failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 500, headers: { "content-type": "application/json" } }));
    expect(await checkConnection("https://api.example.com", fetcher)).toEqual({ ok: false, error: "unavailable" });
  });
  it("aborts stalled requests without depending on worker persistence", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const result = checkConnection("https://api.example.com", fetcher);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await result).toEqual({ ok: false, error: "timeout" });
  });
});

describe("extension messaging boundary", () => {
  const popup = "chrome-extension://trusted/popup.html";
  it("permits the exact trusted popup", async () => {
    const probe = vi.fn().mockResolvedValue({ ok: true, state: "no-session" });
    expect(await handleMessage({ type: "connection/check" }, { id: "trusted", url: popup }, "trusted", popup, probe)).toEqual({ ok: true, state: "no-session" });
    expect(probe).toHaveBeenCalledOnce();
  });
  it.each([
    { id: "other", url: popup },
    { id: "trusted", url: "https://evil.example" },
    { id: "trusted", url: "https://evil.example", tab: { id: 1 } },
    { id: "trusted", url: `${popup}?spoof=1` },
    {},
  ])("blocks unauthorized senders without making API requests", async sender => {
    const probe = vi.fn();
    expect(await handleMessage({ type: "connection/check" }, sender as chrome.runtime.MessageSender, "trusted", popup, probe)).toEqual({ ok: false, error: "forbidden" });
    expect(probe).not.toHaveBeenCalled();
  });
  it.each([null, {}, { type: "fetch", url: "https://evil.example" }, { type: "connection/check", url: "https://evil.example" }])(
    "rejects malformed and arbitrary-fetch requests", async message => {
      const probe = vi.fn();
      expect(await handleMessage(message, { id: "trusted", url: popup }, "trusted", popup, probe)).toEqual({ ok: false, error: "forbidden" });
      expect(probe).not.toHaveBeenCalled();
    },
  );
});

describe("popup response validation", () => {
  it.each([null, { ok: "true", state: "reachable" }, { ok: true, state: ["reachable"] }, { ok: true, state: "reachable", vault: "unexpected data" }])(
    "rejects malformed or data-bearing responses", value => expect(isConnectionResult(value)).toBe(false),
  );
});
