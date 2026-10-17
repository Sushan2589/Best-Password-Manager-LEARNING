import { expect, it } from "vitest";
import { websiteIconUrl } from "../../../web/src/lib/websiteIcons";

it("sends only the normalized hostname, with no saved URL paths, queries or fragments", () => {
  const result = new URL(websiteIconUrl("https://GitHub.com/private-path?secret=public-fixture#private-fragment")!);
  expect(result.origin).toBe("https://www.google.com"); expect(result.pathname).toBe("/s2/favicons");
  expect([...result.searchParams]).toEqual([["domain", "github.com"], ["sz", "64"]]);
  expect(websiteIconUrl("www.vidyanepal.tech/admin/login")).toContain("domain=www.vidyanepal.tech");
  expect(websiteIconUrl("https://github.com.:443/login")).toContain("domain=github.com");
});
it.each([undefined, "", "javascript:alert(1)", "data:image/svg+xml,test", "http://github.com", "https://user:password@github.com", "https://github.com:8443", "https://localhost", "https://127.0.0.1", "https://0x7f000001", "https://[::1]", "https://router.local", "https://service.internal", "https://vault.test", "https://private.example", "https://example.com", "https://private.example.org", "https://hidden.onion", "//github.com", "https://git hub.com", "https://github.com\\@evil.com"])("does not request icons for unsafe or clearly private input %s", input => {
  expect(websiteIconUrl(input)).toBeNull();
});
