import type { MiddlewareHandler } from "hono";

// Bound actual bytes, not just Content-Length. Vault updates include old and
// new Base64 ciphertext; authentication requests should be small.
export const requestBody: MiddlewareHandler = async (c, next) => {
  const max = c.req.path.startsWith("/vault") ? 3 * 1024 * 1024 : 16 * 1024;
  const body = c.req.raw.body;
  if (body) {
    const reader = body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > max) { void reader.cancel().catch(() => {}); return c.json({ error: "Payload too large" }, 413); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    c.req.raw = new Request(c.req.raw, { body: bytes });
  }
  if (["POST", "PATCH", "PUT"].includes(c.req.method) && c.req.path !== "/auth/logout") {
    if (c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return c.json({ error: "JSON content type required" }, 415);
    try { await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  }
  await next();
};
