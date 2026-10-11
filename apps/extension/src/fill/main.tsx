import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { KeyRound, LockKeyhole } from "lucide-react";
import { useAuth } from "../popup/auth/useAuth";
import { AccountPanel } from "../popup/auth/AccountPanel";
import { useVault } from "../popup/vault/useVault";
import { matchesWebsite } from "../popup/sites/matching";
import type { QuickFillView } from "../background/quickFill";
import "../popup/styles.css";

function FillWindow() {
  const request = new URLSearchParams(location.search).get("request");
  const auth = useAuth();
  const refreshAccount = useCallback(() => { void auth.run({ type: "auth/session" }); }, [auth.run]);
  const vault = useVault(auth.account.state === "signed-in" ? auth.account.profile : null, refreshAccount);
  const [target, setTarget] = useState<QuickFillView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formIndex, setFormIndex] = useState(0);
  useEffect(() => {
    const cancel = () => { void chrome.runtime.sendMessage({ type: "fill/cancel", request }).catch(() => {}); };
    window.addEventListener("pagehide", cancel);
    return () => window.removeEventListener("pagehide", cancel);
  }, [request]);
  useEffect(() => {
    let alive = true;
    void chrome.runtime.sendMessage({ type: "fill/view", request }).then(result => {
      if (!alive) return;
      if (result?.ok) setTarget(result); else setError("This fill request expired or the website changed. Return to the website and invoke Fill again.");
    }).catch(() => { if (alive) setError("Unable to open this fill request. Try again from the website."); });
    return () => { alive = false; };
  }, [request]);
  async function fill(id: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await chrome.runtime.sendMessage({ type: "fill/choose", request, id, formIndex });
      if (result?.ok) window.close(); else setError("Unable to fill. The website, form, or unlocked session changed. Invoke Fill again from the website.");
    } catch { setError("Unable to fill. Try again from the website."); }
    finally { setBusy(false); }
  }
  const items = target ? vault.listCredentials().filter(item => matchesWebsite(item.website, target.origin)) : [];
  return <main className="min-h-screen bg-[#faf8f5] p-6">
    <div className="flex items-center gap-2"><KeyRound className="text-[#c45b48]" size={20} /><h1 className="text-lg font-bold">Choose a saved login</h1></div>
    <p className="mt-3 break-all text-xs font-semibold">{target?.origin}</p>
    <p className="mt-2 text-xs leading-5 text-slate-500">Choose an account to fill. Review the fields and submit yourself.</p>
    {error && <p role="alert" className="mt-4 text-xs leading-5 text-red-700">{error}</p>}
    {vault.state.status !== "unlocked" ? <AccountPanel auth={auth} vault={vault} /> : <>
      <button className="secondary mt-3" onClick={vault.lock}><LockKeyhole size={14} />Lock vault</button>
      {target && target.forms.length > 1 && <div className="mt-4"><label htmlFor="fill-form" className="text-xs">Login form</label><select id="fill-form" value={formIndex} onChange={event => setFormIndex(Number(event.target.value))} className="auth-input mt-1">{target.forms.map((form, index) => <option key={form.index} value={index}>{form.label}</option>)}</select></div>}
      {!items.length ? <p role="status" className="mt-6 text-sm">No credentials for this exact HTTPS website.</p> : <ul aria-label="Matching accounts" className="mt-4 space-y-2">{items.map(item => <li key={item.id}><button disabled={busy || !target} onClick={() => void fill(item.id)} className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left disabled:opacity-50"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.username || item.email}</span></button></li>)}</ul>}
    </>}
    <button className="secondary mt-5" onClick={() => { void chrome.runtime.sendMessage({ type: "fill/cancel", request }).catch(() => {}).finally(() => window.close()); }}>Cancel</button>
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><FillWindow /></StrictMode>);
