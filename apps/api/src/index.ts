import { serve } from "@hono/node-server";
import { isIP } from "node:net";
import { createApp } from "./app.js";
import { revocations } from "./services/revocations.js";
import { db } from "./db/client.js";
import { sessionsTable } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { securityLog } from "./services/securityLog.js";

const trustedProxies = (process.env.TRUSTED_PROXY_IPS ?? "").split(",").map(value => value.trim()).filter(Boolean);
if (trustedProxies.some(ip => !isIP(ip))) throw new Error("TRUSTED_PROXY_IPS must contain exact IP addresses.");
const app = createApp({ trustedProxies });
const port = 3001;
console.log(`API running on http://localhost:${port}`);
const server = serve({ fetch: app.fetch, port }) as import("node:http").Server;
server.requestTimeout = 15_000; server.headersTimeout = 10_000;
server.keepAliveTimeout = 5000; server.maxRequestsPerSocket = 100;
let retrying = false;
setInterval(async () => {
  if (retrying) return;
  retrying = true;
  try {
  for (const hash of revocations.pending()) {
    try { await db.delete(sessionsTable).where(eq(sessionsTable.sessionTokenHash, hash)); await revocations.complete(hash); }
    catch { securityLog("session_revocation_failed"); break; }
  }
  } finally { retrying = false; }
}, 60_000).unref();
export default app;
