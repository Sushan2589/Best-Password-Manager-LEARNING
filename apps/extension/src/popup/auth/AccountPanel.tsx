import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle, LogOut, MailCheck, RefreshCw } from "lucide-react";
import type { useAuth } from "./useAuth";
import type { useVault } from "../vault/useVault";
import { VaultPanel } from "../vault/VaultPanel";

export function AccountPanel({ auth, vault }: { auth: ReturnType<typeof useAuth>; vault: ReturnType<typeof useVault> }) {
  const { account, busy, notice, error } = auth;
  const [showPassword, setShowPassword] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const passwordInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((auth.cooldownUntil - Date.now()) / 1000)));
    update(); const timer = setInterval(update, 1000); return () => clearInterval(timer);
  }, [auth.cooldownUntil]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = (new FormData(form).get("email")?.toString() ?? "").trim();
    let password = passwordInput.current?.value ?? "";
    if (passwordInput.current) passwordInput.current.value = "";
    setShowPassword(false);
    const promise = auth.run({ type: "auth/login", email, password });
    password = "";
    await promise;
  }

  return <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
    {account.state === "checking" ? <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin" />Checking your session…</div>
      : account.state === "error" ? <><h3 className="text-sm font-semibold">Session unavailable</h3><button className="secondary mt-4" disabled={busy} onClick={() => void auth.run({ type: "auth/session" })}>Try again</button><button className="secondary mt-2" disabled={busy} onClick={() => void auth.logout()}><LogOut size={14} />Sign out</button></>
      : account.state === "signed-in" && !account.profile.emailVerified ? <>
        <MailCheck size={25} className="text-[#c45b48]" />
        <h3 className="mt-3 text-base font-semibold">Verify your email</h3>
        <p className="mt-2 text-xs leading-5 text-slate-500">Follow the link in your inbox before accessing your vault.</p>
        <p className="mt-2 break-all text-xs font-medium">{account.profile.email}</p>
        <button className="primary mt-4" disabled={busy} onClick={() => void auth.run({ type: "auth/session" })}><RefreshCw size={14} />I’ve verified my email</button>
        <button className="secondary mt-2" disabled={busy || remaining > 0} onClick={() => void auth.run({ type: "auth/resend" })}>{remaining > 0 ? `Resend available in ${remaining}s` : "Resend verification email"}</button>
        <button className="secondary mt-2" disabled={busy} onClick={() => void auth.logout()}><LogOut size={14} />Sign out</button>
      </> : account.state === "signed-in" ? <>
        <VaultPanel vault={vault} />
        <p className="mt-2 break-all text-xs text-slate-500">Signed in as {account.profile.email}</p>
        <button className="secondary mt-4" disabled={busy} onClick={() => { vault.lock(); void auth.logout(); }}><LogOut size={14} />Sign out</button>
      </> : <>
        <h3 className="text-base font-semibold">Welcome back</h3>
        <p className="mt-1 text-xs text-slate-500">Sign in to your password manager account.</p>
        <form onSubmit={event => void login(event)} className="mt-4 space-y-3">
          <div><label htmlFor="email" className="text-xs font-medium">Email</label><input id="email" name="email" type="email" autoComplete="username" maxLength={320} required disabled={busy} className="auth-input mt-1" placeholder="you@example.com" /></div>
          <div><label htmlFor="password" className="text-xs font-medium">Account password</label><div className="relative mt-1"><input ref={passwordInput} id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" minLength={6} maxLength={1024} required disabled={busy} className="auth-input pr-10" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} disabled={busy} onClick={() => setShowPassword(value => !value)} className="absolute right-2 top-2.5 text-slate-400">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
          <button type="submit" className="primary" disabled={busy}>{busy ? <><LoaderCircle size={14} className="animate-spin" />Signing in…</> : "Sign in"}</button>
        </form>
      </>}
    {notice && <p role="status" className="mt-3 text-xs leading-5 text-slate-600">{notice}</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-700">{error}</p>}
    {account.state === "signed-out" && error.includes("server logout") && <button className="secondary mt-3" disabled={busy} onClick={() => void auth.logout()}>Retry logout</button>}
  </section>;
}
