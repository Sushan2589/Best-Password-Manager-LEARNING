import type { DecryptedVaultItem } from "@password-manager/shared";
import { formOperation, type FormChoice, type FormResult } from "../../content/forms";
import { matchesCredential, matchingOrigin } from "./matching";

export type FillTarget = { tabId: number; documentId: string; origin: string; forms: FormChoice[] };
type Browser = Pick<typeof chrome, "tabs" | "scripting">;
export async function activeTarget(browser: Browser = chrome) {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs.length === 1 ? tabs[0] : undefined;
  const origin = matchingOrigin(tab?.url);
  if (!tab?.id || !origin) throw new Error("Website unavailable.");
  return { tabId: tab.id, origin };
}
export async function probeForms(website: string | { website?: string; approvedOrigins?: string[] } | undefined, browser: Browser = chrome): Promise<FillTarget> {
  const target = await activeTarget(browser);
  if (!matchesCredential(typeof website === "string" ? { website } : website ?? {}, target.origin)) throw new Error("Website mismatch.");
  const results = await browser.scripting.executeScript({ target: { tabId: target.tabId, frameIds: [0] }, world: "ISOLATED",
    func: formOperation, args: [{ mode: "probe", origin: target.origin }] });
  const result = results.length === 1 ? results[0] : undefined;
  const data = result?.result as FormResult | undefined;
  if (result?.frameId !== 0 || !result.documentId || !data?.ok || !("forms" in data) || !data.forms.length) throw new Error("No supported login form.");
  return { ...target, documentId: result.documentId, forms: data.forms };
}
export async function fillSelected(target: FillTarget, choice: FormChoice, read: () => DecryptedVaultItem | null,
  authorize: () => Promise<boolean>, browser: Browser = chrome) {
  if (!await authorize()) throw new Error("Vault unavailable.");
  const current = await activeTarget(browser);
  const item = read();
  if (!item || current.tabId !== target.tabId || current.origin !== target.origin || !matchesCredential(item, target.origin)) throw new Error("Website changed.");
  const results = await browser.scripting.executeScript({ target: { tabId: target.tabId, documentIds: [target.documentId] }, world: "ISOLATED",
    func: formOperation, args: [{ mode: "fill", origin: target.origin, index: choice.index, signature: choice.signature,
      username: item.username || item.email || "", password: item.password }] });
  if (results.length !== 1 || results[0]?.frameId !== 0 || results[0].documentId !== target.documentId || !results[0].result?.ok) throw new Error("Unable to fill.");
}
