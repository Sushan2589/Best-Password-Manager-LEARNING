import type { DecryptedVaultItem } from "@password-manager/shared";
import type { CredentialSummary } from "./session";

export function searchCredentials(items: readonly CredentialSummary[], query: string): CredentialSummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  return items.filter(item => [item.title, item.username, item.email, item.website]
    .some(value => value?.toLocaleLowerCase().includes(normalized)))
    .sort((a, b) => a.title.localeCompare(b.title) || (a.username || a.email || "").localeCompare(b.username || b.email || ""));
}

export function safeWebsiteUrl(value: string | undefined): string | null {
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function websiteLabel(website: string | undefined): string {
  const url = safeWebsiteUrl(website);
  return url ? new URL(url).host : website ? "Website unavailable" : "No website saved";
}

type Reader = (id: string) => DecryptedVaultItem | null;
export type CopyField = "username" | "email" | "password";

export async function copyCredential(id: string, field: CopyField, read: Reader,
  write: (text: string) => Promise<void> = text => navigator.clipboard.writeText(text)): Promise<void> {
  let value = read(id)?.[field];
  if (!value) throw new Error("Copy unavailable.");
  try { await write(value); }
  catch { throw new Error("Copy unavailable."); }
  finally { value = undefined; }
}

export async function openCredentialWebsite(id: string, read: Reader,
  open: (url: string) => Promise<unknown> = url => chrome.tabs.create({ url })): Promise<void> {
  const url = safeWebsiteUrl(read(id)?.website);
  if (!url) throw new Error("Website unavailable.");
  try { await open(url); }
  catch { throw new Error("Website unavailable."); }
}
