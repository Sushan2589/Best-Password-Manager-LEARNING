import { useEffect, useState } from "react";
import type { useVault } from "./vault/useVault";
import type { LockPolicy } from "../messaging/session";
import { useActiveSite } from "./sites/useActiveSite";
import { websitePermission } from "../background/inlinePermissions";

export function UnlockSettings({ vault }: { vault: ReturnType<typeof useVault> }) {
  const site = useActiveSite();
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void chrome.storage.local.get("inlineOrigins").then(value => { if (alive) setEnabled(site.status === "ready" && Array.isArray(value.inlineOrigins) && value.inlineOrigins.includes(site.origin)); });
    return () => { alive = false; };
  }, [site]);
  async function toggle() {
    if (site.status !== "ready" || busy) return;
    setBusy(true); setNotice("");
    const origin = site.origin;
    try {
      // Call request directly from the user click so Chrome can prompt.
      if (!enabled && !await chrome.permissions.request({ origins: [websitePermission(origin)] })) { setNotice("Website access was not granted."); return; }
      const result = await chrome.runtime.sendMessage({ type: "inline/settings", origin, enabled: !enabled });
      if (result?.ok) { setEnabled(!enabled); setNotice(enabled ? "Page button disabled." : "Page button enabled for this website."); }
      else setNotice("Unable to change the page button. Try again.");
    } catch { setNotice("Unable to change website access."); }
    finally { setBusy(false); }
  }
  return <>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold">Vault locking</h3>
      <label htmlFor="lock-policy" className="mt-3 block text-xs text-slate-500">Lock the vault</label>
      <select id="lock-policy" value={vault.policy} onChange={event => void vault.setPolicy(Number(event.target.value) as LockPolicy)} className="auth-input mt-2">
        <option value={0}>When the popup closes</option><option value={5}>After 5 minutes of inactivity</option><option value={15}>After 15 minutes of inactivity</option>
      </select>
      <p className="mt-3 text-xs leading-5 text-slate-500">Unlock lasts at most one hour. Browser restart, extension reload, sign out, or manual lock clears it. Your vault stays in memory only.</p>
      {vault.state.status === "unlocked" && <button className="secondary mt-3" onClick={vault.lock}>Lock vault now</button>}
    </section>
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold">Fill without the popup</h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">Press Alt+Shift+L or right-click a login page and choose Fill with Password Manager. Choose an account in the secure window. Configure shortcuts in your browser's Extensions shortcuts page.</p>
      {site.status === "ready" && <><p className="mt-3 break-all text-xs">{site.origin}</p><button className="secondary mt-2" disabled={busy} onClick={() => void toggle()}>{enabled ? "Disable page button for this website" : "Enable page button for this website"}</button></>}
      <p className="mt-2 text-xs leading-5 text-slate-500">The optional page button requires access to this HTTPS hostname. It appears on login forms and opens the account chooser; passwords are filled only after you choose.</p>
      {notice && <p role="status" className="mt-2 text-xs">{notice}</p>}
    </section>
  </>;
}
