import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import { securityLog } from "../services/securityLog.js";

export const RATE_LIMITS = {
  general: { max: 600, windowMs: 60_000 },
  loginIp: { max: 60, windowMs: 15 * 60_000 },
  loginAccount: { max: 10, windowMs: 15 * 60_000 },
  registerAccount: { max: 3, windowMs: 60 * 60_000 },
  registerIp: { max: 5, windowMs: 60 * 60_000 },
  verifyIp: { max: 20, windowMs: 15 * 60_000 },
  resendIp: { max: 10, windowMs: 15 * 60_000 },
  resendAccount: { max: 3, windowMs: 15 * 60_000 },
  logoutIp: { max: 60, windowMs: 15 * 60_000 },
  sensitiveAccount: { max: 10, windowMs: 15 * 60_000 },
} as const;
export type RateLimitPolicy = { max: number; windowMs: number };
type Policy = RateLimitPolicy;

// One policy selection shared by local and distributed enforcement.
export function ipRatePolicies(method: string, path: string, ip: string): Array<[string, string, Policy]> {
  if (method === "POST" && path === "/auth/logout") return [["logout-ip", ip, RATE_LIMITS.logoutIp]];
  const policies: Array<[string, string, Policy]> = [["general", ip, RATE_LIMITS.general]];
  if (method === "POST") {
    if (path.startsWith("/security/") || path.startsWith("/auth/mfa/") || path === "/vault/change-password") policies.push(["sensitive-ip", ip, RATE_LIMITS.loginIp]);
    if (path === "/auth/login") policies.push(["login-ip", ip, RATE_LIMITS.loginIp]);
    if (path === "/auth/register") policies.push(["register-ip", ip, RATE_LIMITS.registerIp]);
    if (path === "/auth/verify-email") policies.push(["verify-ip", ip, RATE_LIMITS.verifyIp]);
    if (path === "/auth/resend-verification") policies.push(["resend-ip", ip, RATE_LIMITS.resendIp]);
  }
  return policies;
}
export function emailRatePolicy(path: string, body: unknown): [string, string, Policy] | undefined {
  if (!["/auth/login", "/auth/resend-verification", "/auth/register"].includes(path)) return;
  if (!body || typeof body !== "object" || !("email" in body) || typeof body.email !== "string" || body.email.length > 254) return;
  const email = body.email.trim().toLowerCase();
  return path === "/auth/login" ? ["login-account", email, RATE_LIMITS.loginAccount]
    : path === "/auth/register" ? ["register-account", email, RATE_LIMITS.registerAccount]
    : ["resend-account", email, RATE_LIMITS.resendAccount];
}

// Single-process baseline. Active buckets are never evicted to admit new keys.
export class MemoryRateLimiter {
  private buckets = new Map<string, { count: number; expires: number }>();
  private salt = randomBytes(32);
  private sweptAt = 0;
  constructor(private now: () => number = Date.now, private capacity = 10_000) {}
  consume(namespace: string, identity: string, policy: Policy) {
    const now = this.now();
    if (now - this.sweptAt >= 30_000) {
      for (const [key, value] of this.buckets) if (value.expires <= now) this.buckets.delete(key);
      this.sweptAt = now;
    }
    const key = createHmac("sha256", this.salt).update(`${namespace}\0${identity}`).digest("hex");
    let bucket = this.buckets.get(key);
    if (bucket && bucket.expires <= now) { this.buckets.delete(key); bucket = undefined; }
    if (!bucket) {
      if (this.buckets.size >= this.capacity) return { allowed: false, retryAfter: 30 };
      bucket = { count: 0, expires: now + policy.windowMs }; this.buckets.set(key, bucket);
    }
    if (bucket.count >= policy.max) return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.expires - now) / 1000)) };
    bucket.count++;
    return { allowed: true, retryAfter: 0 };
  }
}
export function clientIp(c: Context, trustedProxies: readonly string[] = []) {
  let peer = "unknown";
  try { peer = getConnInfo(c).remote.address ?? "unknown"; } catch { /* In-process requests have no socket. */ }
  const forwarded = c.req.header("X-Forwarded-For");
  // A configured immediate proxy must overwrite this with a single client IP.
  return trustedProxies.includes(peer) && forwarded && isIP(forwarded) ? forwarded : peer;
}
export function rateLimits(limiter = new MemoryRateLimiter(), resolveIp: (c: Context) => string = clientIp, phase: "ip" | "account" | "all" = "all"): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    if (c.req.method === "POST" && c.req.path === "/auth/logout") {
      if (phase !== "account") {
        const result = limiter.consume("logout-ip", resolveIp(c), RATE_LIMITS.logoutIp);
        if (!result.allowed) { c.header("Retry-After", String(result.retryAfter)); return c.json({ error: "Too many logout requests. Please retry." }, 429); }
      }
      return next();
    }
    const ip = resolveIp(c);
    const policies = phase === "account" ? [] : ipRatePolicies(c.req.method, c.req.path, ip);
    function check(namespace: string, identity: string, policy: Policy) {
      const result = limiter.consume(namespace, identity, policy);
      if (!result.allowed) { securityLog("rate_limit"); c.header("Retry-After", String(result.retryAfter)); return c.json({ error: "Too many requests. Please try again later." }, 429); }
    }
    for (const [namespace, identity, policy] of policies) { const blocked = check(namespace, identity, policy); if (blocked) return blocked; }
    if (phase !== "ip" && c.req.method === "POST" && ["/auth/login", "/auth/resend-verification", "/auth/register"].includes(c.req.path)) {
      let body: unknown;
      try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
      const policy = emailRatePolicy(c.req.path, body);
      if (policy) {
        const blocked = check(...policy);
        if (blocked) return blocked;
      }
    }
    await next();
  };
}
