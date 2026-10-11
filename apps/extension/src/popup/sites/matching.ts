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
