"use client";
import { useEffect, useState } from "react";
import { clearVaultKey } from "@/lib/crypto/vaultKeyStore";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Session = { id: string; current: boolean; expiresAt: string; lastUsedAt: string };
export default function SecuritySettings() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [password, setPassword] = useState(""); const [code, setCode] = useState("");
  const [email, setEmail] = useState(""); const [secret, setSecret] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]); const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  async function refresh() {
    const [list, status] = await Promise.all([fetch(`${API}/security/sessions`, { credentials: "include", cache: "no-store" }), fetch(`${API}/auth/mfa/status`, { credentials: "include", cache: "no-store" })]);
    if (list.ok) setSessions(await list.json()); if (status.ok) setEnabled((await status.json()).enabled);
  }
  useEffect(() => { void refresh().catch(() => setNotice("Security settings unavailable.")); }, []);
  async function action(path: string, body: object) {
    if (busy) return; setBusy(true); setNotice("");
    try {
      const response = await fetch(`${API}${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, code: code || undefined, ...body }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error === "MFA_REQUIRED" ? "A fresh authenticator or recovery code is required." : "Unable to complete this action. Check your password, code and session.");
      if (data.secret) { setSecret(data.secret); setNotice("Add this key to your authenticator, then enter its six-digit code and enable MFA."); }
      else if (data.recoveryCodes) { setRecovery(data.recoveryCodes); setSecret(""); setEnabled(true); clearVaultKey(); setNotice("MFA enabled. All sessions were revoked. Save these recovery codes offline, then sign in with a fresh code."); }
      else {
        if (path === "/auth/mfa/disable" || path === "/security/sessions/revoke" && sessions.some(session => session.current && "id" in body && session.id === body.id)) { clearVaultKey(); setSessions([]); }
        setNotice(data.message || "Session revoked."); await refresh();
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Security action failed."); }
    finally { setPassword(""); setCode(""); setBusy(false); }
  }
  return <section className="mt-8 rounded-2xl bg-white p-6" aria-label="Account security">
    <h2 className="text-lg font-semibold">Account security</h2>
    <label className="mt-4 block text-sm">Current account password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} maxLength={1024} className="mt-2 w-full rounded-lg border p-3" /></label>
    {enabled && <label className="mt-3 block text-sm">Fresh authenticator or recovery code<input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" maxLength={35} className="mt-2 w-full rounded-lg border p-3" /></label>}
    <h3 className="mt-6 font-semibold">Verified email change</h3>
    <input aria-label="New email address" type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} placeholder="New email address" className="mt-2 w-full rounded-lg border p-3" />
    <button disabled={busy || !password || !email} className="mt-3 rounded-lg bg-[#c45b48] px-4 py-2 text-white disabled:opacity-50" onClick={() => void action("/security/email-change", { email })}>Confirm new email</button>
    <p className="mt-2 text-xs text-slate-500">Your current address remains verified until you confirm the new one. Confirmation revokes existing sessions.</p>
    <h3 className="mt-6 font-semibold">Authenticator protection</h3>
    {enabled ? <><p className="mt-2 text-sm">MFA is enabled. Recovery codes can each be used once.</p><button disabled={busy || !password} className="mt-2 rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void action("/auth/mfa/disable", {})}>Disable MFA and revoke sessions</button></> : <>
      <button disabled={busy || !password} className="mt-2 rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void action("/auth/mfa/setup", {})}>Set up authenticator</button>
      {secret && <><p className="mt-3 text-xs">Enter this setup key manually in your authenticator. Never share it.</p><output className="mt-2 block break-all font-mono text-sm">{secret}</output><label className="mt-3 block text-sm">Authenticator code<input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" maxLength={6} className="mt-2 w-full rounded-lg border p-3" /></label><button disabled={busy || !password || code.length !== 6} className="mt-3 rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => void action("/auth/mfa/enable", { code })}>Enable MFA</button></>}
    </>}
    {!!recovery.length && <section aria-label="Recovery codes" className="mt-4"><p className="text-sm font-semibold">Save these codes offline before leaving this page</p><pre className="mt-2 text-sm">{recovery.join("\n")}</pre></section>}
    <h3 className="mt-6 font-semibold">Active sessions</h3>
    <ul className="mt-2 space-y-3">{sessions.map(session => <li key={session.id} className="text-sm">{session.current ? "This session" : "Another session"} — expires {new Date(session.expiresAt).toLocaleString()}<button disabled={busy || !password} className="ml-3 rounded border px-3 py-1 disabled:opacity-50" onClick={() => void action("/security/sessions/revoke", { id: session.id })}>Revoke</button></li>)}</ul>
    {notice && <p role="status" className="mt-4 text-sm">{notice}</p>}
  </section>;
}
