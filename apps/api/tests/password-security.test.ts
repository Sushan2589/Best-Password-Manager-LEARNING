import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { passwordCompromised } from "../src/services/password.js";

const password = "public-fixture-password-only";
const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
describe("private breached-password screening", () => {
  it("sends only a padded hash prefix and detects a matching breach", async () => {
    const request = vi.fn().mockResolvedValue(new Response(`${hash.slice(5)}:10\r\n${"A".repeat(35)}:0`));
    expect(await passwordCompromised(password, request)).toBe(true);
    expect(request.mock.calls[0]![0]).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    const options = request.mock.calls[0]![1];
    expect(options.headers).toEqual({ "Add-Padding": "true" }); expect(options.redirect).toBe("error");
    expect(JSON.stringify(request.mock.calls)).not.toContain(password);
    expect(JSON.stringify(request.mock.calls)).not.toContain(hash);
  });
  it("ignores zero-count padding", async () => {
    expect(await passwordCompromised(password, vi.fn().mockResolvedValue(new Response(`${hash.slice(5)}:0`)))).toBe(false);
  });
  it.each(["", "invalid", `${hash.slice(5)}:NaN`, "x".repeat(1048577)])("fails closed on a malformed or oversized response", async text => {
    await expect(passwordCompromised(password, vi.fn().mockResolvedValue(new Response(text)))).rejects.toThrow("PASSWORD_CHECK_UNAVAILABLE");
  });
  it("fails closed on HTTP and network errors", async () => {
    await expect(passwordCompromised(password, vi.fn().mockResolvedValue(new Response("", { status: 503 })))).rejects.toThrow("PASSWORD_CHECK_UNAVAILABLE");
    await expect(passwordCompromised(password, vi.fn().mockRejectedValue(new Error("fixture network failure")))).rejects.toThrow("PASSWORD_CHECK_UNAVAILABLE");
  });
});
