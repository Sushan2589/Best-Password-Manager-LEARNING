import { safeWebsiteUrl } from "../vault/credentials";

// Conservative initial policy: HTTPS, exact ASCII hostname, exact effective port.
// No www stripping, parent-domain inference, or implicit subdomain trust.
export function matchingOrigin(value: string | undefined): string | null {
  const safe = safeWebsiteUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  return url.protocol === "https:" ? url.origin : null;
}

export function matchesWebsite(saved: string | undefined, active: string | undefined): boolean {
  const origin = matchingOrigin(saved);
  return origin !== null && origin === matchingOrigin(active);
}

export function matchesCredential(item: { website?: string; approvedOrigins?: string[] }, active: string | undefined): boolean {
  const origin = matchingOrigin(active);
  return origin !== null && (matchesWebsite(item.website, origin) || (item.approvedOrigins ?? []).some(value => value === origin && matchingOrigin(value) === value));
}

// Hints invite approval; they never authorize filling. No arbitrary sibling or
// subdomain inference (e.g. user-owned hosting subdomains) is used.
export function canOfferLoginOrigin(saved: string | undefined, active: string | undefined): boolean {
  const from = matchingOrigin(saved); const to = matchingOrigin(active);
  if (!from || !to || from === to) return false;
  const source = new URL(from); const target = new URL(to);
  if (source.port !== target.port) return false;
  const host = source.hostname; const login = target.hostname;
  if (login === `www.${host}` || host === `www.${login}`) return true;
  return ["google.com", "www.google.com"].includes(host) && login === "accounts.google.com";
}
