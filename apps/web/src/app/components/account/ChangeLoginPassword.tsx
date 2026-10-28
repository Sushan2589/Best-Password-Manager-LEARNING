"use client";
import { useEffect, useRef, useState } from "react";
import { notifyMasterPasswordChange } from "@/lib/crypto/vaultKeyStore";

import { API_URL as API } from "@/lib/api";
const inputClass = "mt-2 w-full rounded-lg border border-slate-200 p-3 focus:border-[#c45b48] focus:outline-none";
const buttonClass = "mt-3 min-h-11 w-full rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";
export default function ChangeLoginPassword({ mfaEnabled, disabled, onBusyChange, onSignedOut }: {
  mfaEnabled: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void; onSignedOut: () => void;
}) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const form = useRef<HTMLFormElement>(null); const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (disabled || busy) return;
    const fields = new FormData(event.currentTarget);
    let password = String(fields.get("accountPassword") ?? ""); let newPassword = String(fields.get("newPassword") ?? "");
    const confirmation = String(fields.get("confirmation") ?? ""); let code = String(fields.get("code") ?? "").trim();
    event.currentTarget.reset(); for (const name of [...fields.keys()]) fields.delete(name);
    if (newPassword !== confirmation || newPassword === password || [...newPassword].length < 15) { setNotice("Choose a different sign-in password of at least 15 characters and confirm it exactly."); return; }
    const request = new AbortController(); controller.current = request; setBusy(true); onBusyChange(true); setNotice("");
    notifyMasterPasswordChange();
    let receivedResponse = false;
    try {
      const response = await fetch(`${API}/security/login-password`, { method: "POST", credentials: "include", redirect: "error", cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]), headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, newPassword, ...(code ? { code } : {}) }) });
      receivedResponse = true;
      if (!response.ok) {
        if (response.status >= 500 && response.status !== 503) throw new Error("The save result could not be confirmed. Try signing in with your new sign-in password first, then the old one. Your vault password stays unchanged.");
        const result = await response.json();
        throw new Error(result.error === "PASSWORD_COMPROMISED" ? "That password has appeared in a breach. Choose a different password." : response.status === 429 ? "Too many attempts. Wait before trying again." : "Nothing was changed. Check your current sign-in password and, if enabled, enter a fresh authenticator or unused recovery code.");
      }
      if (!request.signal.aborted) { setOpen(false); onSignedOut(); setNotice("Sign-in password changed. All sessions are signed out. Sign in using your new sign-in password; your vault unlock password is unchanged."); }
    } catch (error) {
      if (!request.signal.aborted) setNotice(!receivedResponse ? "The save result could not be confirmed. Try your new sign-in password first, then the old one. Your vault password stays unchanged." : error instanceof Error ? error.message : "Unable to confirm the password change.");
    } finally { password = ""; newPassword = ""; code = ""; controller.current = null; setBusy(false); onBusyChange(false); notifyMasterPasswordChange(); }
  }
  return <div className="mt-6 border-t border-slate-100 pt-5">
    <h3 className="font-semibold">Account sign-in password</h3>
    <p className="mt-2 text-sm text-slate-500">Change the password used to sign in to your account. This does not change your vault unlock password or re-encrypt your vault.</p>
    {!open && <button disabled={disabled} className={`${buttonClass} border-slate-200 enabled:hover:bg-slate-50`} onClick={() => { setOpen(true); setNotice(""); }}>Change sign-in password</button>}
    {open && <form ref={form} onSubmit={submit} aria-label="Change sign-in password" className="mt-4 space-y-3">
      <fieldset disabled={disabled || busy} className="space-y-3">
        <label className="block text-sm">Current sign-in password<input name="accountPassword" type="password" autoComplete="current-password" required maxLength={1024} className={inputClass} /></label>
        <label className="block text-sm">New sign-in password<input name="newPassword" type="password" autoComplete="new-password" required minLength={15} maxLength={1024} className={inputClass} /></label>
        <label className="block text-sm">Confirm new sign-in password<input name="confirmation" type="password" autoComplete="new-password" required minLength={15} maxLength={1024} className={inputClass} /></label>
        {mfaEnabled && <label className="block text-sm">Authenticator code for sign-in password change<input name="code" autoComplete="one-time-code" required maxLength={35} className={inputClass} placeholder="Fresh app code or unused recovery code" /></label>}
        <button type="submit" className={`${buttonClass} border-transparent bg-[#c45b48] text-white enabled:hover:bg-[#b84f3e]`}>Change sign-in password and sign out</button>
      </fieldset>
      <button type="button" disabled={busy} className={`${buttonClass} border-slate-200 enabled:hover:bg-slate-50`} onClick={() => { form.current?.reset(); setOpen(false); }}>Cancel sign-in password change</button>
    </form>}
    {busy && <p role="status" className="text-sm">Saving securely. Keep this page open until the result is confirmed.</p>}
    {notice && <p role="status" className="mt-3 rounded-lg bg-[#faf9f7] p-3 text-sm">{notice}</p>}
  </div>;
}
