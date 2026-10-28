import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { API_URL } from "@/lib/api";

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const api = new URL(API_URL, request.url).origin;
  const development = process.env.NODE_ENV !== "production";
  const policy = ["default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self'${development ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`}`, "style-src-attr 'unsafe-inline'",
    `connect-src 'self' ${api}${development ? " ws: wss:" : ""}`, "img-src 'self' data: https://www.google.com/s2/favicons https://t0.gstatic.com/faviconV2 https://t1.gstatic.com/faviconV2 https://t2.gstatic.com/faviconV2 https://t3.gstatic.com/faviconV2", "font-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce); headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
