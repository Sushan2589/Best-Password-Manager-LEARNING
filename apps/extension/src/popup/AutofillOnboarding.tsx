import { useEffect, useRef, useState } from "react";
import { Check, MousePointerClick } from "lucide-react";
import { ALL_HTTPS_SITES } from "../background/inlinePermissions";

// Only rendered for verified accounts. Opening the card never requests access;
// the browser permission request must originate directly from the user's click.
export function AutofillOnboarding() {
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void chrome.storage.local.get(["autofillSetupDismissed", "inlineAllSites", "inlineOrigins"]).then(value => {
      // Respect users who already selected global/site-only access or disabled it.
      const decided = value.autofillSetupDismissed === true || typeof value.inlineAllSites === "boolean" ||
        Array.isArray(value.inlineOrigins) && value.inlineOrigins.length > 0;
      if (alive.current) setVisible(!decided);
    }).catch(() => { /* Settings remain available if preference storage fails. */ });
    return () => { alive.current = false; };
  }, []);

  async function enable() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setNotice("");
    try {
      // Keep this as the first awaited operation to preserve browser user activation.
      const granted = await chrome.permissions.request({ origins: [ALL_HTTPS_SITES] });
      if (!alive.current) return;
      if (!granted) { setNotice("Website access was not granted. Try again, or enable autofill later in Settings."); return; }
      const result = await chrome.runtime.sendMessage({ type: "inline/all-sites", enabled: true });
      if (!alive.current) return;
      if (result?.ok === true) { setEnabled(true); setVisible(false); }
      else setNotice("Unable to enable autofill. Try again or use Settings.");
    } catch { if (alive.current) setNotice("Unable to enable autofill. Try again or use Settings."); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  async function dismiss() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setNotice("");
    try {
      await chrome.storage.local.set({ autofillSetupDismissed: true });
      if (alive.current) setVisible(false);
    } catch { if (alive.current) setNotice("Unable to save your choice. Please try again."); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }

  if (enabled) return <p role="status" className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"><Check size={15} className="mt-0.5 shrink-0" />Autofill is ready. Unlock your vault, then click a login field and choose an account.</p>;
  if (!visible) return null;
  return <section aria-label="Autofill setup" className="mb-4 rounded-xl border border-[#c45b48]/20 bg-[#c45b48]/5 p-4">
    <div className="flex items-center gap-2"><MousePointerClick size={18} className="text-[#c45b48]" /><h4 className="text-sm font-semibold">Set up autofill</h4></div>
    <p className="mt-2 text-xs leading-5 text-slate-600">See your saved accounts when you click a login field, without opening this popup. Approve access to HTTPS websites once.</p>
    <button type="button" className="primary mt-3 text-xs" disabled={busy} onClick={() => void enable()}>{busy ? "Please wait..." : "Enable autofill on all HTTPS websites"}</button>
    <button type="button" className="mt-2 min-h-9 w-full rounded-lg text-xs font-semibold text-slate-500 transition-colors hover:bg-white hover:text-slate-700" disabled={busy} onClick={() => void dismiss()}>Not now</button>
    <p className="mt-2 text-[11px] leading-4 text-slate-500">Your vault must be unlocked. You choose which account to fill; forms are never submitted automatically. Change access anytime in Settings.</p>
    {notice && <p role="status" className="mt-2 text-xs leading-5 text-slate-600">{notice}</p>}
  </section>;
}
