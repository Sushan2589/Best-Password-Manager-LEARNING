import { useEffect, useRef, useState, type FormEvent } from "react";
import { vaultEntrySchema, type VaultEntry } from "@password-manager/shared";
import { startCapture, takeCapture, cancelCapture } from "../sites/captureClient";
import { matchesWebsite, matchingOrigin } from "../sites/matching";
import { activeTarget } from "../sites/autofill";
import type { useVault } from "./useVault";

const blank = (): VaultEntry => ({ title: "", username: "", password: "", website: "" });
export function SavePanel({ vault, origin }: { vault: ReturnType<typeof useVault>; origin?: string }) {
  const [draft, setDraft] = useState<VaultEntry | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [capturedOrigin, setCapturedOrigin] = useState<string | null>(null);
  const [updateId, setUpdateId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const alive = useRef(true);
  const pending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const accounts = capturedOrigin ? vault.listCredentials().filter(item => matchesWebsite(item.website, capturedOrigin)) : [];
  function reset() { setDraft(null); setCapturedOrigin(null); setUpdateId(""); setConfirmed(false); }
  async function action(mode: "watch" | "review" | "cancel") {
    if (pending.current) return; pending.current = true; setBusy(true); setNotice("");
    try {
      if (mode === "watch") {
        await startCapture(() => alive.current ? vault.authorizeAction() : Promise.resolve(false));
        if (alive.current) setNotice("Watching the next submission for up to 2 minutes. Submit yourself, then reopen, unlock, and review. Worker suspension may discard it. Nothing is saved automatically.");
      } else if (mode === "cancel") { await cancelCapture(); if (alive.current) { reset(); setNotice("Pending capture discarded."); } }
      else {
        const entry = await takeCapture(() => alive.current ? vault.authorizeAction() : Promise.resolve(false));
        if (alive.current) {
          if (entry) { setDraft(entry); setCapturedOrigin(entry.website!); setUpdateId(""); setConfirmed(false); }
          else setNotice("No pending submission for this website. Captures expire, and worker restart or page navigation before capture delivery can discard them.");
        }
      }
    } catch { if (alive.current) setNotice("Unable to perform this action. Use the website toolbar popup with an unlocked vault and a valid session."); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || !confirmed || pending.current) return;
    const value = vaultEntrySchema.safeParse({ ...draft, username: draft.username || undefined, email: draft.email || undefined, website: draft.website || undefined });
    if (!value.success || value.data.password.length > 4096 || value.data.website && !matchingOrigin(value.data.website)) { setNotice("Enter a title, account, password, and valid HTTPS website when provided."); return; }
    pending.current = true; setBusy(true); setNotice("");
    try {
      if (capturedOrigin) {
        const target = await activeTarget();
        if (!alive.current || target.origin !== capturedOrigin || value.data.website !== capturedOrigin) throw new Error("Website changed.");
      }
      const existing = updateId ? vault.readCredential(updateId) : null;
      if (updateId && (!existing || !capturedOrigin || !matchesWebsite(existing.website, capturedOrigin))) throw new Error("Wrong account.");
      const entry = existing ? { ...existing, password: value.data.password } : value.data;
      if (!alive.current) return;
      const result = await vault.saveEntry(entry, updateId || undefined);
      if (alive.current) {
        if (result.ok) { reset(); setNotice(updateId ? "Credential password updated." : "Credential saved."); }
        else setNotice(result.error === "conflict" ? "The account or credential changed. Lock and unlock again before retrying; nothing was overwritten." : "Unable to save. Your session or connection may have changed. Check the web vault before retrying.");
      }
    } catch { if (alive.current) setNotice("Unable to save. The website or selected account changed."); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  if (!expanded) return <button className="secondary mb-4" onClick={() => setExpanded(true)}>Save credentials</button>;
  return <section aria-label="Save credentials" className="mb-4 rounded-lg border border-slate-200 p-3">
    {!draft ? <>
      <button className="secondary" disabled={busy} onClick={() => { setDraft({ ...blank(), website: origin || "" }); setNotice(""); }}>Add credential</button>
      <div className="mt-2 flex gap-2"><button className="secondary" disabled={busy} onClick={() => void action("watch")}>Watch submission</button><button className="secondary" disabled={busy} onClick={() => void action("review")}>Review capture</button></div>
      <button className="mt-2 text-[11px] text-slate-500" disabled={busy} onClick={() => void action("cancel")}>Discard pending capture</button>
      <button className="ml-3 text-[11px] text-slate-500" disabled={busy} onClick={() => { reset(); setExpanded(false); setNotice(""); }}>Close save tools</button>
    </> : <form onSubmit={event => void save(event)} className="space-y-3">
      <h4 className="text-sm font-semibold">{capturedOrigin ? "Review submitted credentials" : "Add credential"}</h4>
      {capturedOrigin && <><p className="text-xs leading-5 text-slate-500">A submission does not prove login succeeded. Save only after checking the account and website.</p>
        <label className="block text-xs">Save destination<select aria-label="Save destination" className="auth-input mt-1" value={updateId} disabled={busy} onChange={event => { setUpdateId(event.target.value); setConfirmed(false); }}><option value="">Create new credential</option>{accounts.map(item => <option key={item.id} value={item.id}>Update {item.title}: {item.username || item.email}</option>)}</select></label>
        {updateId && <p className="text-xs">Only the selected account’s password will change. Its other fields are preserved.</p>}
      </>}
      {(["title", "username", "email", "password", "website"] as const).map(field => <label key={field} className="block text-xs capitalize">{field}<input aria-label={`Save ${field}`} type={field === "password" ? "password" : field === "email" ? "email" : "text"} autoComplete="off" className="auth-input mt-1" maxLength={field === "password" ? 4096 : field === "title" ? 100 : 255} required={field === "title" || field === "password"} disabled={busy || Boolean(capturedOrigin && field === "website") || Boolean(updateId && field !== "password")} value={draft[field] || ""} onChange={event => { setDraft({ ...draft, [field]: event.target.value }); setConfirmed(false); }} /></label>)}
      <label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" aria-label="Confirm save" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I confirm this website/account and want to {updateId ? "update this password" : "save these credentials"}.</label>
      <button className="primary" disabled={busy || !confirmed}>{busy ? "Saving…" : updateId ? "Confirm update" : "Confirm save"}</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => { reset(); setNotice(""); }}>Cancel</button>
    </form>}
    {notice && <p role="status" className="mt-2 text-xs leading-5 text-slate-500">{notice}</p>}
  </section>;
}
