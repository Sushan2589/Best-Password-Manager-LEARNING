import { useRef, useState, useEffect } from "react";
import type { useVault } from "../vault/useVault";
import { fillSelected, probeForms, type FillTarget } from "./autofill";

export function AutofillPanel({ vault, id }: { vault: ReturnType<typeof useVault>; id: string }) {
  const [target, setTarget] = useState<FillTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function inspect() {
    setBusy(true); setNotice("");
    try {
      const next = await probeForms(vault.readCredential(id)?.website);
      if (!alive.current || !vault.readCredential(id)) return;
      setTarget(next);
      if (next.forms.length === 1) await fill(next, 0);
    } catch { if (alive.current) setNotice("Unable to fill. Use a matching HTTPS website with a supported login form."); }
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
  </section>;
}
