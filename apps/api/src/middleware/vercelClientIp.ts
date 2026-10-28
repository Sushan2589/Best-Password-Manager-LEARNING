import { ipAddress } from "@vercel/functions";
import { isIP } from "node:net";
import type { Context } from "hono";
import { clientIp } from "./rateLimit.js";

export function vercelClientIp(c: Context): string {
  // Only trust platform-overwritten headers inside the Vercel runtime.
  // Cloudflare must use DNS-only records for this deployment (see DEPLOYMENT.md).
  if (process.env.VERCEL !== "1") return clientIp(c);
  try {
    const ip = ipAddress(c.req.raw);
    return ip && isIP(ip) ? ip : "unknown";
  } catch {
    return "unknown"; // Arcjet fails closed for missing/malformed IPs.
  }
}
