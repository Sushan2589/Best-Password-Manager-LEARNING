"use client";

import { useEffect, useRef, useState } from "react";
import { changeMasterPassword } from "@/lib/crypto/changeMasterPassword";
import PasswordInput from "../PasswordInput";

const inputClass = "mt-2 w-full rounded-lg border border-slate-200 p-3 focus:border-[#c45b48] focus:outline-none focus:ring-2 focus:ring-[#c45b48]/20";
const buttonClass = "mt-3 min-h-11 w-full rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";

export default function ChangeMasterPassword({ mfaEnabled, disabled, onBusyChange, onSignedOut }: {
  mfaEnabled: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void; onSignedOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => () => { controller.current?.abort(); }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    const fields = new FormData(event.currentTarget);
    const input = { accountPassword: String(fields.get("accountPassword") ?? ""), currentMaster: String(fields.get("currentMaster") ?? ""),
      newMaster: String(fields.get("newMaster") ?? ""), confirmation: String(fields.get("confirmation") ?? ""), code: String(fields.get("code") ?? "").trim() };
    // Clear DOM and FormData references before lengthy crypto/network work.
    event.currentTarget.reset(); for (const name of [...fields.keys()]) fields.delete(name);
    const request = new AbortController(); controller.current = request;
    setBusy(true); onBusyChange(true); setNotice("");
    try {
      await changeMasterPassword(input, request.signal, () => setCommitting(true));
      if (request.signal.aborted) return;
      setOpen(false); onSignedOut();
      setNotice("Vault master password changed. All sessions are signed out. Sign in with your existing account password, then unlock using your new master password.");
    } catch (error) {
      if (!request.signal.aborted) setNotice(error instanceof Error ? error.message : "Password change failed. Check your session and retry.");
    } finally {
      if (controller.current === request) { controller.current = null; setBusy(false); setCommitting(false); onBusyChange(false); }
    }
  }

  return <div className="mt-6 border-t border-slate-100 pt-5">
    <h3 className="font-semibold">Vault unlock password (master password)</h3>
    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><strong>This changes only your vault unlock password.</strong> Your sign-in password stays the same. To change how you sign in, use Account sign-in password below.</p>
    <p className="mt-2 text-sm text-slate-500">Change the password that unlocks your encrypted vault. Your account sign-in password stays the same. Every entry is re-encrypted locally and all sessions are signed out after saving.</p>
    <p className="mt-2 text-xs text-slate-500">Close other vault edits first. Keep your new password safe: a forgotten master password cannot be recovered.</p>
    {!open && <button disabled={disabled} className={`${buttonClass} border-slate-200 enabled:hover:bg-slate-50`} onClick={() => { setOpen(true); setNotice(""); }}>Change vault password</button>}
    {open && <form ref={form} onSubmit={submit} className="mt-4 space-y-3" aria-label="Change vault master password">
      <fieldset disabled={busy || disabled} className="space-y-3">
        <label className="block text-sm">Current account sign-in password<PasswordInput label="current account sign-in password" name="accountPassword" autoComplete="current-password" required maxLength={1024} className={inputClass} /></label>
        <label className="block text-sm">Current vault master password<PasswordInput label="current vault master password" name="currentMaster" autoComplete="off" required maxLength={1024} className={inputClass} /></label>
        <label className="block text-sm">New vault master password<PasswordInput label="new vault master password" name="newMaster" autoComplete="new-password" required minLength={15} maxLength={1024} className={inputClass} /></label>
        <p className="text-xs text-slate-500">Use a unique passphrase of at least 15 characters.</p>
        <label className="block text-sm">Confirm new vault master password<PasswordInput label="new vault master password confirmation" name="confirmation" autoComplete="new-password" required minLength={15} maxLength={1024} className={inputClass} /></label>
        {mfaEnabled && <label className="block text-sm">Fresh MFA code for this change<input name="code" autoComplete="one-time-code" required maxLength={35} placeholder="6-digit authenticator or unused recovery code" className={inputClass} /><span className="mt-2 block text-xs text-slate-500">Enter a fresh code for this change, even if you recently signed in with MFA.</span></label>}
        <button type="submit" className={`${buttonClass} border-transparent bg-[#c45b48] text-white enabled:hover:bg-[#b84f3e]`}>Change vault password and sign out</button>
      </fieldset>
      <button type="button" disabled={committing} className={`${buttonClass} border-slate-200 enabled:hover:bg-slate-50 sm:ml-2`} onClick={() => { controller.current?.abort(); form.current?.reset(); setOpen(false); setNotice("Password change cancelled before saving."); }}>Cancel password change</button>
    </form>}
    {busy && <p role="status" className="mt-3 text-sm">{committing ? "Saving securely. Keep this page open until the result is confirmed." : "Checking and re-encrypting your vault locally..."}</p>}
    {notice && <p role="status" className="mt-3 rounded-lg bg-[#faf9f7] p-3 text-sm">{notice}</p>}
  </div>;
}
