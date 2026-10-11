export function resolveApiOrigin(value: string | undefined, development: boolean): string {
  const configured = value?.trim() || (development ? "http://localhost:3001" : "");
  if (!configured) throw new Error("Set VITE_API_ORIGIN to the production HTTPS API origin.");

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("VITE_API_ORIGIN must be a valid origin.");
  }

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const allowedProtocol = url.protocol === "https:" || (development && local && url.protocol === "http:");
  if (!allowedProtocol || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use an HTTPS origin without credentials, path, query, or fragment; HTTP loopback is development-only.");
  }
  return url.origin;
}
