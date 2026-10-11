import { useRef, useState, useEffect } from "react";
import type { useVault } from "../vault/useVault";
import { activeTarget, fillSelected, probeForms, type FillTarget } from "./autofill";
import { useActiveSite } from "./useActiveSite";
import { canOfferLoginOrigin, matchesCredential } from "./matching";
import { LoginOriginApproval } from "./LoginOriginApproval";

export function AutofillPanel({ vault, id }: { vault: ReturnType<typeof useVault>; id: string }) {
  const [target, setTarget] = useState<FillTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const alive = useRef(true);
  const site = useActiveSite();
  const item = vault.readCredential(id);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function inspect() {
    setBusy(true); setNotice("");
    try {
      const next = await probeForms(vault.readCredential(id) ?? undefined);
      if (!alive.current || !vault.readCredential(id)) return;
      setTarget(next);
      if (next.forms.length === 1) await fill(next, 0);
    } catch (error) { if (alive.current) setNotice(error instanceof Error && error.message === "Website mismatch." ? "This account is not approved for the current website. Review the login address below, or correct its saved Website URL." : error instanceof Error && error.message === "No supported login form." ? "No supported login fields were detected on this page. Open the website's sign-in page and try again." : "Unable to inspect this website. Check extension site access, then refresh the page and try again."); }
    finally { if (alive.current) setBusy(false); }
  }
  async function fill(next: FillTarget, index: number) {
    setBusy(true);
    try {
      await fillSelected(next, next.forms[index]!, () => alive.current ? vault.readCredential(id) : null,
        () => alive.current ? vault.authorizeAction() : Promise.resolve(false));
      if (alive.current) { setTarget(null); setNotice("Login fields filled. Review them and submit yourself."); }
    } catch { if (alive.current) { setTarget(null); setNotice("Unable to fill. The form, website, or session may have changed."); } }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="mt-4">
    <button className="primary" disabled={busy} onClick={() => void inspect()}>{busy ? "Checking…" : "Fill login"}</button>
    {target && target.forms.length > 1 && <div className="mt-2"><p className="text-xs">Choose the login form to fill.</p>{target.forms.map((choice, index) => <button key={choice.index} disabled={busy} className="secondary mt-2" onClick={() => void fill(target, index)}>{choice.label}</button>)}</div>}
    {notice && <p role="status" className="mt-2 text-xs leading-5 text-slate-500">{notice}</p>}
    {item && site.status === "ready" && !matchesCredential(item, site.origin) && canOfferLoginOrigin(item.website, site.origin) && <LoginOriginApproval key={`${id}:${site.origin}`} item={item} origin={site.origin} approve={async () => {
      const current = await activeTarget(); if (current.origin !== site.origin) return false;
      const entry = vault.readCredential(id); if (!entry) return false;
      const result = await vault.saveEntry({ ...entry, approvedOrigins: [...new Set([...(entry.approvedOrigins ?? []), site.origin])] }, id);
      if (result.ok && alive.current) setNotice("Login website approved. Select Fill login to fill this step.");
      return result.ok;
    }} />}
  </section>;
}
