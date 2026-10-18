import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ArcjetAllowDecision, ArcjetDenyDecision, ArcjetErrorDecision,
  ArcjetErrorReason, ArcjetRateLimitReason, ArcjetRuleResult,
  type ArcjetContext, type ArcjetRequestDetails, type ArcjetRule,
} from "@arcjet/node";
import { createHmac } from "node:crypto";
import { arcjetConfig } from "../src/config/arcjet.js";
import { createArcjetLimiter } from "../src/services/arcjet.js";
import { RATE_LIMITS } from "../src/middleware/rateLimit.js";

const remote = vi.hoisted(() => ({ decide: vi.fn(), report: vi.fn(), options: vi.fn() }));
// Exercise the actual SDK's rule construction, fingerprinting and adaptation.
// Replace only its cloud boundary; no API key or external network is needed.
vi.mock("@arcjet/node", async importOriginal => {
  const actual = await importOriginal<typeof import("@arcjet/node")>();
  return { ...actual, createRemoteClient: (options: unknown) => { remote.options(options); return remote; } };
});
const live = { mode: "LIVE" as const, key: "ajkey_public_test_fixture", identityKey: "a1".repeat(32) };
function reason(resetTime = new Date(Date.now() + 42_000)) {
  return new ArcjetRateLimitReason({ max: 10, remaining: 0, reset: 42, window: 900, resetTime });
}
function allow() { return new ArcjetAllowDecision({ ttl: 0, reason: reason(), results: [] }); }
beforeEach(() => { vi.clearAllMocks(); remote.decide.mockImplementation(async () => allow()); });

describe("Arcjet deployment configuration", () => {
  it("is offline without credentials in development/test", () => {
    expect(arcjetConfig({ NODE_ENV: "test" })).toEqual({ mode: "OFF" });
    expect(createArcjetLimiter({ mode: "OFF" })).toBeUndefined();
    expect(remote.options).not.toHaveBeenCalled();
  });
  it("requires LIVE and both private keys in production", () => {
    const env = { NODE_ENV: "production", ARCJET_KEY: live.key, ARCJET_IDENTITY_KEY: live.identityKey };
    expect(arcjetConfig(env)).toEqual(live);
    for (const override of [
      { ARCJET_MODE: "OFF" }, { ARCJET_MODE: "DRY_RUN" }, { ARCJET_MODE: "typo" },
      { ARCJET_KEY: "" }, { ARCJET_IDENTITY_KEY: "short" }, { ARCJET_ENV: "development" },
    ]) expect(() => arcjetConfig({ ...env, ...override })).toThrow();
    expect(() => arcjetConfig({ NODE_ENV: "production" })).toThrow();
  });
});

describe("Arcjet SDK and privacy boundary", () => {
  it("uses real sliding-window rules with ONLY scope + keyed identity characteristics", async () => {
    const limiter = createArcjetLimiter(live)!;
    expect(await limiter.check("login-account", "fixture@example.test", RATE_LIMITS.loginAccount)).toEqual({ status: "allow" });
    const [context, details, rules] = remote.decide.mock.calls[0] as [ArcjetContext, ArcjetRequestDetails, ArcjetRule[]];
    expect(context.characteristics).toEqual(["securityScope", "securityIdentity"]);
    expect(details.extra).toEqual({ securityScope: "login-account", securityIdentity: createHmac("sha256", Buffer.from(live.identityKey, "hex")).update("login-account\0fixture@example.test").digest("hex") });
    expect(details.ip).toBe("127.0.0.1"); expect(details.query).toBe(""); expect(details.cookies).toBe("");
    expect(details.email).toBeUndefined(); expect(details.metadata).toBeUndefined();
    expect([...details.headers]).toEqual([["host", "password-manager.invalid"]]);
    expect(await context.getBody()).toBe("");
    expect(JSON.stringify(details)).not.toContain("fixture@example.test");
    expect(rules).toMatchObject([{ type: "RATE_LIMIT", algorithm: "SLIDING_WINDOW", mode: "LIVE", max: 10, interval: 900 }]);
    expect(remote.options).toHaveBeenCalledWith({ timeout: 500 });
  });
  it("keeps identities stable across clients/restarts while separating scopes and accounts", async () => {
    for (const [scope, identity] of [["login-account", "one@example.test"], ["login-account", "one@example.test"], ["resend-account", "one@example.test"], ["login-account", "two@example.test"]]) {
      await createArcjetLimiter(live)!.check(scope!, identity!, RATE_LIMITS.loginAccount);
    }
    const fingerprints = remote.decide.mock.calls.map(call => (call[0] as ArcjetContext).fingerprint);
    expect(fingerprints[0]).toBeTruthy(); expect(fingerprints[0]).toBe(fingerprints[1]);
    expect(fingerprints[0]).not.toBe(fingerprints[2]); expect(fingerprints[0]).not.toBe(fingerprints[3]);
  });
  it("hashes validated IPs and rejects missing/socket-less identities in LIVE", async () => {
    const limiter = createArcjetLimiter(live)!;
    expect(await limiter.check("general", "198.51.100.7", RATE_LIMITS.general)).toEqual({ status: "allow" });
    expect(JSON.stringify(remote.decide.mock.calls[0]?.[1])).not.toContain("198.51.100.7");
    expect(await limiter.check("general", "unknown", RATE_LIMITS.general)).toEqual({ status: "error" });
    expect(remote.decide).toHaveBeenCalledTimes(1);
  });
  it("converts denials to a bounded positive Retry-After", async () => {
    remote.decide.mockResolvedValue(new ArcjetDenyDecision({ ttl: 0, reason: reason(), results: [] }));
    const result = await createArcjetLimiter(live)!.check("login-account", "fixture@example.test", RATE_LIMITS.loginAccount);
    expect(result.status).toBe("deny");
    if (result.status === "deny") { expect(result.retryAfter).toBeGreaterThan(0); expect(result.retryAfter).toBeLessThanOrEqual(42); }
  });
  it("treats SDK fail-open errors and thrown transport failures as unavailable", async () => {
    remote.decide.mockResolvedValue(new ArcjetErrorDecision({ ttl: 0, reason: new ArcjetErrorReason("private-remote-message"), results: [] }));
    expect(await createArcjetLimiter(live)!.check("general", "198.51.100.7", RATE_LIMITS.general)).toEqual({ status: "error" });
    remote.decide.mockRejectedValue(new Error("private-password cookie ajkey_secret"));
    expect(await createArcjetLimiter(live)!.check("general", "198.51.100.8", RATE_LIMITS.general)).toEqual({ status: "error" });
  });
  it("does not accept ALLOW decisions with a failed rule", async () => {
    remote.decide.mockResolvedValue(new ArcjetAllowDecision({ ttl: 0, reason: reason(), results: [new ArcjetRuleResult({ ruleId: "fixture", fingerprint: "fixture", ttl: 0, state: "RUN", conclusion: "ERROR", reason: new ArcjetErrorReason("private-error") })] }));
    expect(await createArcjetLimiter(live)!.check("general", "198.51.100.7", RATE_LIMITS.general)).toEqual({ status: "error" });
  });
  it("observes DRY_RUN denials and errors without blocking or leaking SDK diagnostics", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    remote.decide.mockImplementation(async (context: ArcjetContext) => {
      context.log.warn({ secret: "private-SDK-diagnostics" }, "private-cookie");
      context.log.error("private-password");
      return new ArcjetDenyDecision({ ttl: 0, reason: reason(), results: [new ArcjetRuleResult({ ruleId: "fixture", fingerprint: "fixture", ttl: 0, state: "RUN", conclusion: "DENY", reason: reason() })] });
    });
    const limiter = createArcjetLimiter({ ...live, mode: "DRY_RUN" })!;
    expect(await limiter.check("login-account", "fixture@example.test", RATE_LIMITS.loginAccount)).toEqual({ status: "allow" });
    remote.decide.mockRejectedValue(new Error("private-remote-message"));
    expect(await limiter.check("login-account", "another@example.test", RATE_LIMITS.loginAccount)).toEqual({ status: "allow" });
    const output = JSON.stringify(warn.mock.calls);
    expect(output).not.toContain("private-"); expect(output).not.toContain("example.test"); expect(output).not.toContain(live.key);
  });
});
