import { vaultEntrySchema, type VaultEntry } from "@password-manager/shared";
import { formOperation } from "../../content/forms";
import { watchSubmissions, cancelSubmissionWatch, type WatchOptions } from "../../content/capture";
import { activeTarget } from "./autofill";

export async function startCapture(authorize: () => Promise<boolean>) {
  if (!await authorize()) throw new Error("Vault unavailable.");
  const target = await activeTarget();
  const results = await chrome.scripting.executeScript({ target: { tabId: target.tabId, frameIds: [0] }, world: "ISOLATED",
    func: formOperation, args: [{ mode: "probe", origin: target.origin }] });
  const result = results[0];
  if (results.length !== 1 || result?.frameId !== 0 || !result.documentId || !result.result?.ok) throw new Error("Website unavailable.");
  const watch = await chrome.runtime.sendMessage({ type: "capture/start", ...target, documentId: result.documentId });
  if (!watch?.ok || typeof watch.token !== "string" || !watch.publicKey || typeof watch.expires !== "number") throw new Error("Unable to watch.");
  const current = await activeTarget();
  if (current.tabId !== target.tabId || current.origin !== target.origin || !await authorize()) { await cancelCapture(); throw new Error("Website changed."); }
  const options: WatchOptions = { origin: target.origin, token: watch.token, publicKey: watch.publicKey, expires: watch.expires };
  const installed = await chrome.scripting.executeScript({ target: { tabId: target.tabId, documentIds: [result.documentId] }, world: "ISOLATED", func: watchSubmissions, args: [options] });
  if (installed.length !== 1 || installed[0]?.frameId !== 0 || installed[0].documentId !== result.documentId || installed[0].result !== true) { await cancelCapture(); throw new Error("Unable to watch."); }
}
export async function takeCapture(authorize: () => Promise<boolean>): Promise<VaultEntry | null> {
  if (!await authorize()) throw new Error("Vault unavailable.");
  const response = await chrome.runtime.sendMessage({ type: "capture/take" });
  if (!response?.ok) throw new Error("Capture unavailable.");
  if (response.entry === null) return null;
  const entry = vaultEntrySchema.safeParse(response.entry);
  const current = await activeTarget();
  if (!entry.success || entry.data.website !== current.origin || !await authorize()) throw new Error("Website changed.");
  return entry.data;
}
export async function cancelCapture() {
  await chrome.runtime.sendMessage({ type: "capture/cancel" });
  try {
    const target = await activeTarget();
    await chrome.scripting.executeScript({ target: { tabId: target.tabId, frameIds: [0] }, world: "ISOLATED", func: cancelSubmissionWatch });
  } catch { /* The worker key is already discarded even if the document left. */ }
}
