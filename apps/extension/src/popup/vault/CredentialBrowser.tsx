import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Copy, ExternalLink, Eye, EyeOff, Globe, Search, X } from "lucide-react";
import type { useVault } from "./useVault";
import { copyCredential, openCredentialWebsite, safeWebsiteUrl, searchCredentials, websiteLabel, type CopyField } from "./credentials";
import { useActiveSite } from "../sites/useActiveSite";
import { matchesCredential, canOfferLoginOrigin } from "../sites/matching";
import { LoginOriginApproval } from "../sites/LoginOriginApproval";
import { SiteAccessPrompt } from "../sites/SiteAccessPrompt";
import { activeTarget } from "../sites/autofill";
import { AutofillPanel } from "../sites/AutofillPanel";
import { SavePanel } from "./SavePanel";

type Vault = ReturnType<typeof useVault>;

export function CredentialBrowser({ vault }: { vault: Vault }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [scope, setScope] = useState<"site" | "all">("site");
  const site = useActiveSite();
  const siteIdentity = site.status === "ready" ? site.origin : site.status;
  useEffect(() => { setSelected(null); }, [siteIdentity]);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { root.current?.closest("main")?.scrollTo(0, 0); }, [selected]);
  const items = vault.listCredentials();
  const siteItems = site.status === "ready" ? items.filter(item => matchesCredential(item, site.origin)) : [];
  const scoped = scope === "all" || site.status === "unavailable" || site.status === "insecure" ? items : siteItems;
  const matches = searchCredentials(scoped, query);
  if (selected) return <div ref={root}><CredentialDetails key={selected} vault={vault} id={selected} onBack={() => setSelected(null)} /></div>;
  return <div ref={root} className="mt-4">
    <SavePanel key={siteIdentity} vault={vault} origin={site.status === "ready" ? site.origin : undefined} />
    <section aria-label="Current website" className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-semibold text-slate-500">Current website</p>
      <p className="mt-1 break-all text-xs leading-5">{site.status === "ready" ? site.origin : site.status === "checking" ? "Checking current website…" : site.status === "insecure" ? "HTTP websites are not eligible for matching." : "Website detection unavailable. Open the extension using its toolbar button on a website."}</p>
      {site.status === "ready" && <div className="mt-2 flex gap-2">
        <button aria-pressed={scope === "site"} className="secondary site-filter" onClick={() => { setScope("site"); setQuery(""); }}>This site ({siteItems.length})</button>
        <button aria-pressed={scope === "all"} className="secondary site-filter" onClick={() => { setScope("all"); setQuery(""); }}>All credentials ({items.length})</button>
      </div>}
    </section>
    {site.status === "ready" && <><SiteAccessPrompt origin={site.origin} />{items.filter(item => !matchesCredential(item, site.origin) && canOfferLoginOrigin(item.website, site.origin)).map(item => <LoginOriginApproval key={`${item.id}:${site.origin}`} item={item} origin={site.origin} approve={async () => {
      const target = await activeTarget(); if (target.origin !== site.origin) return false;
      const entry = vault.readCredential(item.id); if (!entry) return false;
      const result = await vault.saveEntry({ ...entry, approvedOrigins: [...new Set([...(entry.approvedOrigins ?? []), site.origin])] }, item.id);
      return result.ok;
    }} />)}</>}
    <label className="sr-only" htmlFor="credential-search">Search credentials</label>
    <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400" />
      <input id="credential-search" type="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your vault" className="auth-input credential-search" />
      {query && <button aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-3 top-3 text-slate-400"><X size={14} /></button>}
    </div>
    <p className="mt-3 text-[11px] text-slate-500">{matches.length} {matches.length === 1 ? "credential" : "credentials"}{query.trim() ? " found" : " saved"}</p>
    {matches.length === 0 ? <div className="py-6 text-center"><Search className="mx-auto text-slate-300" size={24} /><h4 className="mt-3 text-sm font-semibold">{site.status === "checking" && scope === "site" ? "Checking current website…" : site.status === "ready" && scope === "site" && !query.trim() ? "No credentials for this website" : items.length ? "No matching credentials" : "No credentials saved"}</h4><p className="mt-2 text-xs text-slate-500">{site.status === "ready" && scope === "site" ? "Approve a recognized login website above, or check the saved Website URL under All credentials. Filling requires an exact HTTPS address or an address you explicitly approved." : items.length ? "Try another website, title, or account." : "Add a credential in your web vault to get started."}</p></div>
      : <ul aria-label="Saved credentials" className="mt-2 divide-y divide-slate-100">{matches.map(item => <li key={item.id}>
        <button onClick={() => setSelected(item.id)} className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left hover:bg-slate-50" aria-label={`View ${item.title}, ${item.username || item.email}`}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#c45b48]/8 text-[#c45b48]"><Globe size={17} /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{item.username || item.email}</span><span className="mt-0.5 block truncate text-[11px] text-slate-400">{websiteLabel(item.website)}</span></span>
          <ChevronRight size={15} className="shrink-0 text-slate-400" />
        </button>
      </li>)}</ul>}
  </div>;
}

function CredentialDetails({ vault, id, onBack }: { vault: Vault; id: string; onBack: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState("");
  const [copying, setCopying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const alive = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    const hide = () => setRevealed(false);
    window.addEventListener("blur", hide);
    return () => { alive.current = false; window.removeEventListener("blur", hide); };
  }, []);
  const item = vault.readCredential(id);
  if (!item) return null;
  const website = safeWebsiteUrl(item.website);

  async function copy(field: CopyField) {
    if (pending.current) return;
    pending.current = true; setCopying(true); setFeedback(""); setFailure("");
    try {
      await copyCredential(id, field, vault.readCredential);
      if (alive.current && vault.readCredential(id)) setFeedback(`${field === "email" ? "Email" : field === "username" ? "Username" : "Password"} copied.`);
    } catch { if (alive.current && vault.readCredential(id)) setFailure("Unable to copy. Keep the popup focused and try again."); }
    finally { pending.current = false; if (alive.current) setCopying(false); }
  }
  async function openWebsite() {
    setFeedback(""); setFailure("");
    try { await openCredentialWebsite(id, vault.readCredential); }
    catch { if (alive.current && vault.readCredential(id)) setFailure("Unable to open this website."); }
  }

  return <div className="mt-4">
    <button autoFocus className="flex items-center gap-1.5 text-xs font-semibold text-[#c45b48]" onClick={onBack}><ArrowLeft size={14} />Back to credentials</button>
    <h4 className="mt-4 break-words text-lg font-semibold">{item.title}</h4>
    <AutofillPanel vault={vault} id={id} />
    {item.username && <DetailField label="Username" value={item.username} disabled={copying} onCopy={() => void copy("username")} />}
    {item.email && <DetailField label="Email" value={item.email} disabled={copying} onCopy={() => void copy("email")} />}
    <div className="mt-4"><p className="text-[11px] font-semibold text-slate-500">Password</p>
      <div className="mt-1 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <span aria-label="Saved password" className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs">{revealed ? item.password : "••••••••••••"}</span>
        <button aria-label={revealed ? "Hide password" : "Show password"} aria-pressed={revealed} onClick={() => setRevealed(value => !value)} className="text-slate-500">{revealed ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        <button aria-label="Copy password" disabled={copying} onClick={() => void copy("password")} className="text-slate-500"><Copy size={15} /></button>
      </div>
    </div>
    <div className="mt-4"><p className="text-[11px] font-semibold text-slate-500">Website</p><p className="mt-1 break-all text-xs leading-5 text-slate-600">{website || (item.website ? "This website address cannot be opened safely." : "No website saved")}</p>
      {website && <button className="secondary mt-2" onClick={() => void openWebsite()}><ExternalLink size={13} />Open website{website.startsWith("http:") ? " (HTTP)" : ""}</button>}
    </div>
    {!!item.approvedOrigins?.length && <section aria-label="Approved login websites" className="mt-4">
      <p className="text-[11px] font-semibold text-slate-500">Approved login websites</p>
      {item.approvedOrigins.map(origin => <div key={origin} className="mt-2 flex items-center gap-2"><span className="min-w-0 flex-1 break-all text-xs">{origin}</span><button className="secondary" disabled={removing} aria-label={`Remove approval for ${origin}`} onClick={() => {
        setRemoving(true); setFeedback(""); setFailure("");
        const current = vault.readCredential(id);
        if (!current) { setRemoving(false); return; }
        void vault.saveEntry({ ...current, approvedOrigins: (current.approvedOrigins ?? []).filter(value => value !== origin) }, id).then(result => {
          if (alive.current) { if (result.ok) setFeedback("Login website approval removed."); else setFailure("Unable to remove approval. Check your session and try again."); }
        }).catch(() => { if (alive.current) setFailure("Unable to remove approval."); }).finally(() => { if (alive.current) setRemoving(false); });
      }}>Remove</button></div>)}
    </section>}
    {item.notes && <div className="mt-4"><p className="text-[11px] font-semibold text-slate-500">Notes</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{item.notes}</p></div>}
    <p className="mt-4 text-[10px] leading-4 text-slate-400">Copied values may remain in your device clipboard after locking.</p>
    {feedback && <p role="status" className="mt-2 text-xs text-emerald-700">{feedback}</p>}
    {failure && <p role="alert" className="mt-2 text-xs text-red-700">{failure}</p>}
  </div>;
}

function DetailField({ label, value, disabled, onCopy }: { label: string; value: string; disabled: boolean; onCopy: () => void }) {
  return <div className="mt-4"><p className="text-[11px] font-semibold text-slate-500">{label}</p><div className="mt-1 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-xs">{value}</span><button aria-label={`Copy ${label.toLowerCase()}`} disabled={disabled} onClick={onCopy} className="text-slate-500"><Copy size={15} /></button></div></div>;
}
