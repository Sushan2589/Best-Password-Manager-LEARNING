import { DEVELOPMENT_EXTENSION_ORIGIN } from "../../../../config/extension-identity.js";

export function securityConfig(env: Record<string, string | undefined> = process.env) {
  const production = env.NODE_ENV === "production";
  const webOrigin = env.WEB_ORIGIN || (production ? "" : "http://localhost:3000");
  let url: URL;
  try { url = new URL(webOrigin); }
  catch { throw new Error("Set WEB_ORIGIN to the exact website origin, e.g. https://passwordmanager.sushandahal.com.np (without /api or a trailing slash)."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.origin !== webOrigin || url.username || url.password ||
      (url.protocol !== "https:" && !(local && !production && url.protocol === "http:"))) {
    throw new Error("WEB_ORIGIN must be an exact HTTPS origin (HTTP loopback is development-only).");
  }
  const extensions = (env.EXTENSION_ORIGINS ?? (production ? "" : DEVELOPMENT_EXTENSION_ORIGIN))
    .split(",").map(origin => origin.trim()).filter(Boolean);
  if (extensions.some(origin => !/^chrome-extension:\/\/[a-p]{32}$/.test(origin))) {
    throw new Error("EXTENSION_ORIGINS must contain exact comma-separated chrome-extension origins.");
  }
  return { webOrigin, allowedOrigins: [webOrigin, ...extensions], secureCookies: production };
}

export const SECURITY = securityConfig();
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: SECURITY.secureCookies,
  sameSite: "lax" as const,
  path: "/",
};
