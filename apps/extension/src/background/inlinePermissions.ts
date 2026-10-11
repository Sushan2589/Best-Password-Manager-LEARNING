import { matchingOrigin } from "../popup/sites/matching";

// One exact HTTPS hostname per grant; no wildcard subdomains. Match patterns
// cannot restrict ports, but the vault and fill authorisation still do.
export function websitePermission(origin: string) {
  const normalized = matchingOrigin(origin);
  if (!normalized || normalized !== origin) throw new Error("Invalid website.");
  return `https://${new URL(origin).hostname}/*`;
}
export async function syncInlineScripts() {
  const stored = await chrome.storage.local.get("inlineOrigins");
  const enabled: string[] = Array.isArray(stored.inlineOrigins) ? stored.inlineOrigins.filter((value: unknown): value is string => typeof value === "string") : [];
  const origins: string[] = [];
  for (const origin of enabled) {
    try {
      const pattern = websitePermission(origin);
      if (await chrome.permissions.contains({ origins: [pattern] })) origins.push(pattern);
    } catch { /* Ignore malformed nonsecret settings. */ }
  }
  const existing = await chrome.scripting.getRegisteredContentScripts();
  const inline = existing.filter(script => script.id.startsWith("inline-"));
  if (inline.length) await chrome.scripting.unregisterContentScripts({ ids: inline.map(script => script.id) });
  if (origins.length) await chrome.scripting.registerContentScripts([...new Set(origins)].map((origin, index) => ({ id: `inline-${index}`, matches: [origin],
    js: ["inline.js"], runAt: "document_idle" as const, allFrames: false, persistAcrossSessions: true, world: "ISOLATED" as const })));
}
