import { describe, expect, it, vi } from "vitest";
import { matchesWebsite, matchingOrigin } from "../../src/popup/sites/matching";
import { observeActiveSite, siteFromTabs, type TabSnapshot } from "../../src/popup/sites/activeSite";

describe("exact HTTPS website matching", () => {
  it.each([
    ["https://github.com", "https://github.com/login", true],
    ["https://www.vidyanepal.tech", "https://www.vidyanepal.tech/admin/login", true],
    ["https://www.vidyanepal.tech", "https://vidyanepal.tech/admin/login", false],
    ["https://www.vidyanepal.tech", "https://www.vidyanepal.tech.evil.com/admin/login", false],
    ["https://GITHUB.com:443/settings?private=1#fragment", "https://github.com/login", true],
    ["https://google.com", "https://accounts.google.com", false],
    ["https://accounts.google.com", "https://accounts.google.com/login", true],
    ["https://github.com", "https://github.com.evil.com", false],
    ["https://example.com", "https://notexample.com", false],
    ["https://example.com", "http://example.com", false],
    ["http://example.com", "https://example.com", false],
    ["http://example.com", "http://example.com", false],
    ["https://example.com", "https://example.com:8443", false],
    ["https://example.com:8443", "https://example.com:8443/login", true],
    ["https://example.com", "https://www.example.com", false],
    ["https://example.com", "https://example.com.", false],
    ["https://bücher.example", "https://xn--bcher-kva.example/login", true],
    ["https://github.com", "https://gіthub.com", false],
    ["https://example.com", "https://example.com@evil.com", false],
    ["https://example.com", "https://evil.com@example.com", false],
    ["javascript:alert(1)", "https://example.com", false],
    [undefined, undefined, false],
    ["not a URL", "https://example.com", false],
    ["https://example.com", "https://example.com\n", false],
  ])("%s against %s => %s", (saved, active, expected) => expect(matchesWebsite(saved, active)).toBe(expected));
  it("retains only the normalized origin", () => {
    expect(matchingOrigin("https://EXAMPLE.com/path?secret=value#private")).toBe("https://example.com");
  });
});

describe("active tab lifecycle", () => {
  it.each([[], [{ url: "chrome://settings" }], [{}], [{ url: "https://example.com" }, { url: "https://evil.com" }]].map(tabs => ({ tabs })))("fails closed on unavailable tabs", ({ tabs }) => {
    expect(siteFromTabs(tabs)).toEqual({ status: "unavailable" });
  });
  it("marks HTTP ineligible and rejects pending navigation", () => {
    expect(siteFromTabs([{ url: "http://example.com" }])).toEqual({ status: "insecure" });
    expect(siteFromTabs([{ url: "https://example.com", status: "loading" }])).toEqual({ status: "checking" });
  });
  it("discards out-of-order responses and stops publishing after disposal", async () => {
    const resolvers: Array<(tabs: TabSnapshot[]) => void> = [];
    const read = () => new Promise<TabSnapshot[]>(resolve => resolvers.push(resolve));
    let refresh = () => {};
    const unsubscribe = vi.fn();
    const publish = vi.fn();
    const stop = observeActiveSite(read, callback => { refresh = callback; return unsubscribe; }, publish);
    refresh();
    resolvers[1]!([{ url: "https://new.example/path" }]); await Promise.resolve();
    resolvers[0]!([{ url: "https://old.example/private" }]); await Promise.resolve();
    expect(publish.mock.calls.at(-1)).toEqual([{ status: "ready", origin: "https://new.example" }]);
    refresh(); stop(); const count = publish.mock.calls.length;
    refresh(); // A callback already queued by an event source is also ignored.
    resolvers[2]!([{ url: "https://old.example" }]); await Promise.resolve();
    expect(publish).toHaveBeenCalledTimes(count);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it("sanitizes query failures and immediately clears the previous origin", async () => {
    let refresh = () => {};
    const read = vi.fn().mockResolvedValueOnce([{ url: "https://example.com" }]).mockRejectedValueOnce(new Error("private URL"));
    const publish = vi.fn();
    const stop = observeActiveSite(read, callback => { refresh = callback; return () => {}; }, publish);
    await Promise.resolve();
    refresh(); expect(publish.mock.calls.at(-1)).toEqual([{ status: "checking" }]);
    await Promise.resolve(); await Promise.resolve();
    expect(publish.mock.calls.at(-1)).toEqual([{ status: "unavailable" }]); stop();
  });
});
