"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearVaultKey } from "@/lib/crypto/vaultKeyStore";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
type Session = { id: string; current: boolean; expiresAt: string; lastUsedAt: string };
const inputClass = "mt-2 w-full rounded-lg border border-slate-200 p-3 focus:border-[#c45b48] focus:outline-none focus:ring-2 focus:ring-[#c45b48]/20";
const baseButtonClass = "mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border px-4 py-2.5 text-center text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";
const buttonClass = `${baseButtonClass} border-slate-200 enabled:hover:border-slate-300 enabled:hover:bg-slate-50`;
const primaryButtonClass = `${baseButtonClass} border-transparent bg-[#c45b48] text-white enabled:hover:bg-[#b84f3e]`;
const dangerButtonClass = `${baseButtonClass} border-red-200 bg-red-50 text-red-700 enabled:hover:border-red-300 enabled:hover:bg-red-100`;

export default function SecuritySettings() {
  const router = useRouter();
  const passwordInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sessionEnded, setSessionEnded] = useState(false);

  async function refresh() {
    setLoading(true); setLoadError("");
    try {
      const [list, status] = await Promise.all([
        fetch(`${API}/security/sessions`, { credentials: "include", cache: "no-store" }),
        fetch(`${API}/auth/mfa/status`, { credentials: "include", cache: "no-store" }),
      ]);
      if (list.status === 401 || status.status === 401) {
        clearVaultKey(); setSessionEnded(true); setSessions([]);
        throw new Error("Your session has expired. Sign in again to manage account security.");
      }
      if (list.status === 403 || status.status === 403) throw new Error("Verify your email before managing account security.");
      if (!list.ok || !status.ok) throw new Error("Account security could not be loaded. Try again.");
      const items = await list.json(); const factor = await status.json();
      if (!Array.isArray(items) || typeof factor.enabled !== "boolean") throw new Error("Account security could not be loaded. Try again.");
      setSessions(items); setEnabled(factor.enabled);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Account security could not be loaded. Try again.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  async function action(path: string, body: object) {
    if (busy || loading) return;
    if (sessionEnded) { setNotice("Sign in again to manage account security."); return; }
    if (loadError) { setNotice("Reload account security before making changes."); return; }
    if (!password) {
      setNotice(secret ? "Enter your current account password again above to confirm authenticator setup." : "Enter your current account password above to authorize this action.");
      passwordInput.current?.focus(); return;
    }
    if (path === "/auth/mfa/enable" && !/^\d{6}$/.test(code)) {
      setNotice("Enter the current six-digit code shown in your authenticator app, not the setup key or an email code.");
      codeInput.current?.focus(); return;
    }
    if (path === "/security/email-change" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setNotice("Enter a valid new email address."); return;
    }
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`${API}${path}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, code: code || undefined, ...body }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "MFA_REQUIRED") throw new Error("Enter a fresh six-digit code from your authenticator app, or one unused recovery code, then re-enter your account password and retry.");
        if (response.status === 429) throw new Error("Too many attempts. Wait before trying again.");
        if (data.error === "Invalid or expired setup code") throw new Error("That authenticator code is invalid or expired. Enter the latest six-digit code and your account password, then retry. Setup expires after ten minutes.");
        if (path === "/auth/mfa/setup" && response.status === 409) throw new Error("Authenticator setup is unavailable. It may already be enabled, or the service needs attention. Reload and try again.");
        throw new Error("Unable to complete this action. Re-enter your account password and check your code and session.");
      }
      if (data.secret) {
        setSecret(data.secret); setCode("");
        setNotice("Setup key ready. Follow the steps below, then re-enter your account password above and enter the code from your authenticator app.");
      } else if (data.recoveryCodes) {
        setRecovery(data.recoveryCodes); setSecret(""); setEnabled(true);
        setSessionEnded(true); setSessions([]); clearVaultKey();
        setNotice("MFA enabled. Save these recovery codes offline before leaving. All sessions were signed out; sign in again with a fresh authenticator code.");
      } else {
        const revokedCurrent = path === "/security/sessions/revoke" && sessions.some(session => session.current && "id" in body && session.id === body.id);
        if (path === "/auth/mfa/disable" || revokedCurrent) {
          clearVaultKey(); setSessions([]); setSecret(""); setRecovery([]); setSessionEnded(true);
          if (path === "/auth/mfa/disable") setEnabled(false);
          setNotice(revokedCurrent ? "This session was revoked. Sign in again to continue." : "MFA disabled and all sessions signed out. Sign in again to continue.");
        } else {
          setNotice(data.message || "The selected session was revoked. Your current session remains signed in.");
          await refresh();
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Security action failed. Try again.");
    } finally { setPassword(""); setCode(""); setBusy(false); }
  }

  return <section className="mt-8 min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6" aria-label="Account security">
    <h2 className="text-lg font-semibold">Account security</h2>
    <p className="mt-2 text-sm text-slate-500">Confirm your identity before changing protection or signing out a session.</p>
    <label className="mt-4 block text-sm">Current account password
      <input ref={passwordInput} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} maxLength={1024} aria-describedby="security-password-help" placeholder="Password you use to sign in" className={inputClass} disabled={busy || sessionEnded} />
    </label>
    <p id="security-password-help" className="mt-2 text-xs text-slate-500">Enter the password you use to sign in to this password manager. It is cleared after each request; enter it again for the next action.</p>
    {enabled && !sessionEnded && <label className="mt-3 block text-sm">Fresh authenticator or recovery code
      <input ref={codeInput} value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" maxLength={35} aria-describedby="security-factor-help" placeholder="6-digit app code or unused recovery code" className={inputClass} />
      <span id="security-factor-help" className="mt-2 block text-xs text-slate-500">Use the current code from Google Authenticator, Microsoft Authenticator or another authenticator app. A recent MFA sign-in may allow this field to stay empty.</span>
    </label>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-[#faf9f7] p-3 text-sm">{notice}</p>}
    {sessionEnded && <button className={buttonClass} onClick={() => router.push("/login")}>Sign in again</button>}
    {loading && <p role="status" className="mt-4 text-sm">Loading account security...</p>}
    {loadError && <div className="mt-4 text-sm"><p role="alert">{loadError}</p>{!sessionEnded && <button disabled={loading} className={buttonClass} onClick={() => void refresh()}>Reload account security</button>}</div>}

    <div className="mt-6 border-t border-slate-100 pt-5">
      <h3 className="font-semibold">Verified email change</h3>
      <input aria-label="New email address" type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} placeholder="New email address" className={inputClass} />
      <button disabled={busy || loading || sessionEnded} className={primaryButtonClass} onClick={() => void action("/security/email-change", { email })}>Confirm new email</button>
      <p className="mt-2 text-xs text-slate-500">Enter your account password above, then request confirmation. Your current address stays active until you confirm the new one. Confirmation signs out existing sessions.</p>
    </div>

    <div className="mt-6 border-t border-slate-100 pt-5">
      <h3 className="font-semibold">Authenticator protection <span className="ml-2 text-xs font-normal text-slate-500">{loading || loadError ? "Status unavailable" : enabled ? "Enabled" : "Off"}</span></h3>
      <p className="mt-2 text-sm text-slate-500">Optional extra protection: after your password, sign in with a code generated by an authenticator app on your phone. This code is not sent by email.</p>
      {enabled ? <>
        <p className="mt-2 text-xs text-slate-500">To disable protection, enter your account password and, when required, a fresh app or recovery code above. Disabling signs out every session.</p>
        <button disabled={busy || loading || sessionEnded} className={dangerButtonClass} onClick={() => void action("/auth/mfa/disable", {})}>Disable MFA and revoke sessions</button>
      </> : secret ? <div className="mt-4 rounded-xl border border-slate-200 bg-[#faf9f7] p-4">
        <h4 className="text-sm font-semibold">Connect your authenticator</h4>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>Open Google Authenticator, Microsoft Authenticator or another authenticator app on your phone.</li>
          <li>Add an account manually using a setup key. Name it <strong>Password Manager</strong>, enter the key below and choose <strong>Time based</strong>.</li>
          <li>Enter the current six-digit code shown for that account below.</li>
          <li>Re-enter your current account password above, then click <strong>Enable MFA</strong>.</li>
        </ol>
        <p className="mt-4 text-xs font-medium">Setup key: enter this in your authenticator app only</p>
        <output aria-label="Authenticator setup key" className="mt-2 block break-all rounded-lg border bg-white p-3 font-mono text-sm">{secret}</output>
        <p className="mt-2 text-xs text-slate-500">Keep this key private. Setup expires after ten minutes.</p>
        <label className="mt-4 block text-sm">Authenticator code
          <input ref={codeInput} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-describedby="authenticator-code-help" placeholder="6-digit code from your app" className={inputClass} />
        </label>
        <p id="authenticator-code-help" className="mt-2 text-xs text-slate-500">Enter the six digits shown in the app, not the setup key, your password or an emailed verification code.</p>
        <button disabled={busy || loading || sessionEnded} className={primaryButtonClass} onClick={() => void action("/auth/mfa/enable", { code })}>Enable MFA</button>
        <button disabled={busy} className={`${buttonClass} sm:ml-2`} onClick={() => { setSecret(""); setCode(""); setPassword(""); setNotice("Authenticator setup cancelled. Protection is still off."); }}>Cancel setup</button>
      </div> : <>
        <p className="mt-2 text-xs text-slate-500">Enter your account password above, then click Set up authenticator. You will receive a setup key to add to your app.</p>
        <button disabled={busy || loading || sessionEnded} className={buttonClass} onClick={() => void action("/auth/mfa/setup", {})}>Set up authenticator</button>
      </>}
      {!!recovery.length && <section aria-label="Recovery codes" className="mt-4 rounded-xl border border-slate-200 p-4">
        <h4 className="text-sm font-semibold">Save these recovery codes offline before leaving</h4>
        <p className="mt-2 text-xs text-slate-500">Each code works once if you lose access to your authenticator. They are shown only now. Keep them private.</p>
        <pre className="mt-3 whitespace-pre-wrap break-all text-sm">{recovery.join("\n")}</pre>
      </section>}
    </div>

    <div className="mt-6 border-t border-slate-100 pt-5">
      <h3 className="font-semibold">Active sessions</h3>
      <p className="mt-2 text-sm text-slate-500">Enter your account password above, then revoke the session you want to sign out. MFA does not need to be enabled to revoke sessions.</p>
      {!loading && !loadError && !sessions.length && <p className="mt-3 text-sm">{sessionEnded ? "You are signed out of this session." : "No active sessions found."}</p>}
      <ul className="mt-3 space-y-3">{sessions.map(session => <li key={session.id} className="rounded-lg border border-slate-200 p-3 text-sm">
        <p className="font-medium">{session.current ? "This session" : "Another session"}</p>
        <p className="mt-1 text-xs text-slate-500">Last active {new Date(session.lastUsedAt).toLocaleString()}. Expires {new Date(session.expiresAt).toLocaleString()}.</p>
        <button disabled={busy || loading || sessionEnded} className={dangerButtonClass} onClick={() => void action("/security/sessions/revoke", { id: session.id })}>{session.current ? "Revoke this session and sign out" : "Revoke session"}</button>
      </li>)}</ul>
    </div>
  </section>;
}
