import { Hono } from "hono";
import { createApp } from "./app.js";
import { vercelClientIp } from "./middleware/vercelClientIp.js";
import { mountApi } from "./vercelApp.js";

// Vercel owns the HTTP listener and function lifecycle. Keep local serve() and
// its disk-revocation retry timer in index.ts, outside this dependency graph.
const app = mountApi(new Hono(), createApp({ resolveIp: vercelClientIp }));
export default app;
