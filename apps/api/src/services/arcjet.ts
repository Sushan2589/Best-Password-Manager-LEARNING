import arcjet, { createRemoteClient, slidingWindow, type ArcjetLogger } from "@arcjet/node";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { arcjetConfig } from "../config/arcjet.js";
import type { RateLimitPolicy } from "../middleware/rateLimit.js";
import { securityLog } from "./securityLog.js";

export type ProtectionResult = { status: "allow" } | { status: "deny"; retryAfter: number } | { status: "error" };
export interface DistributedRateLimiter {
  check(scope: string, identity: string, policy: RateLimitPolicy): Promise<ProtectionResult>;
}

// SDK diagnostics may include request fields, keys or remote error details.
// Discard their arguments; emit only our bounded, sanitized event categories.
const log: ArcjetLogger = {
  debug() {}, info() {}, warn() { securityLog("arcjet_error"); }, error() { securityLog("arcjet_error"); },
};

export function createArcjetLimiter(config = arcjetConfig()): DistributedRateLimiter | undefined {
  if (config.mode === "OFF") return;
  const base = arcjet({
    key: config.key, rules: [], log,
    characteristics: ["securityScope", "securityIdentity"],
    client: createRemoteClient({ timeout: 500 }),
  });
  const clients = new Map<string, ReturnType<typeof base.withRule>>();
  return {
    async check(scope, identity, policy) {
      // IPs have already been resolved from the actual socket/trusted proxy.
      // An absent connection identity must not silently disable enforcement.
      if ((scope === "general" || scope.endsWith("-ip")) && !isIP(identity)) {
        securityLog("arcjet_error");
        return config.mode === "DRY_RUN" ? { status: "allow" } : { status: "error" };
      }
      try {
        let client = clients.get(scope);
        if (!client) {
          client = base.withRule(slidingWindow({ mode: config.mode, max: policy.max, interval: policy.windowMs / 1000 }));
          clients.set(scope, client);
        }
        const securityIdentity = createHmac("sha256", Buffer.from(config.identityKey, "hex"))
          .update(`${scope}\0${identity}`).digest("hex");
        // Deliberately NOT the user's request: no body, cookie, Authorization,
        // email, token URL, vault ciphertext, headers or real client IP leaves
        // the API. Rate-limit fingerprints use only scope + keyed identity.
        const decision = await client.protect({
          method: "POST", url: "https://password-manager.invalid/rate-limit",
          headers: { host: "password-manager.invalid" }, body: "",
          socket: { remoteAddress: "127.0.0.1", encrypted: true },
        }, { securityScope: scope, securityIdentity, ipSrc: "127.0.0.1" });
        if (config.mode === "DRY_RUN") {
          if (decision.results.some(result => result.isDenied())) securityLog("arcjet_would_block");
          if (decision.isErrored() || decision.results.some(result => result.conclusion === "ERROR")) securityLog("arcjet_error");
          return { status: "allow" };
        }
        if (decision.isDenied()) {
          const reset = decision.reason.isRateLimit() ? decision.reason.resetTime?.getTime() : undefined;
          const seconds = reset === undefined ? policy.windowMs / 1000 : Math.ceil((reset - Date.now()) / 1000);
          return { status: "deny", retryAfter: Math.max(1, Math.min(policy.windowMs / 1000, Number.isFinite(seconds) ? seconds : 1)) };
        }
        if (decision.isErrored() || decision.results.some(result => result.conclusion === "ERROR") || !decision.isAllowed()) {
          securityLog("arcjet_error"); return { status: "error" };
        }
        return { status: "allow" };
      } catch {
        securityLog("arcjet_error");
        return config.mode === "DRY_RUN" ? { status: "allow" } : { status: "error" };
      }
    },
  };
}
