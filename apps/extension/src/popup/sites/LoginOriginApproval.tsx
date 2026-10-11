import { useState } from "react";
import { canOfferLoginOrigin } from "./matching";
import type { CredentialSummary } from "../vault/session";

// Render only in packaged popup/fill UI, never in a website's content script.
export function LoginOriginApproval({ item, origin, approve }: { item: CredentialSummary; origin: string; approve: () => Promise<boolean> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!canOfferLoginOrigin(item.website, origin)) return null;
  return <section className="mt-4 rounded-lg border border-[#c45b48]/30 bg-white p-3" aria-label={`Approve login website for ${item.title}`}>
    <h3 className="text-sm font-semibold">Use {item.title} on this login website?</h3>
    <p className="mt-2 break-all text-xs">Saved website: {item.website}</p><p className="mt-1 break-all text-xs font-semibold">Login website: {origin}</p>
    <p className="mt-2 text-xs leading-5 text-slate-500">Approve only if you recognize this login address. This allows this account on this exact address; it does not trust other subdomains. Approval is saved encrypted in your vault.</p>
    <label className="mt-3 flex gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} />I recognize and trust this login website</label>
    <button className="primary mt-3" disabled={!confirmed || busy} onClick={() => {
      setBusy(true); setError(""); void approve().then(ok => { if (!ok) setError("Unable to save approval. Check your session and try again."); }).catch(() => setError("Unable to save approval.")).finally(() => setBusy(false));
    }}>{busy ? "Saving…" : "Approve login website"}</button>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  </section>;
}
