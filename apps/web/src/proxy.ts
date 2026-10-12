import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const api = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").origin;
  const development = process.env.NODE_ENV !== "production";
  const policy = ["default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self'${development ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`}`, "style-src-attr 'unsafe-inline'",
    `connect-src 'self' ${api}${development ? " ws: wss:" : ""}`, "img-src 'self' data:", "font-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce); headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
