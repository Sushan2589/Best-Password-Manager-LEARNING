// The lookup receives only a public-looking DNS hostname, never a full URL.
export function websiteIconUrl(website?: string): string | null {
  if (!website || website.length > 2048 || /[\s\\]/.test(website) || website.startsWith("/")) return null;
  try {
    const url = new URL(website.includes("://") ? website : `https://${website}`);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (hostname.length > 253 || !hostname.includes(".") || !hostname.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
    const suffix = hostname.split(".").at(-1)!;
    if (!/^[a-z][a-z0-9-]*$/.test(suffix) || ["localhost", "local", "lan", "internal", "home", "test", "invalid", "example", "onion"].includes(suffix)) return null;
    if (["example.com", "example.net", "example.org"].some(value => hostname === value || hostname.endsWith(`.${value}`))) return null;
    return `https://www.google.com/s2/favicons?${new URLSearchParams({ domain: hostname, sz: "64" })}`;
  } catch { return null; }
}
