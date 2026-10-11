import { useRef, type FormEvent } from "react";
import { LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import type { useVault } from "./useVault";
import type { VaultError } from "./session";
import { CredentialBrowser } from "./CredentialBrowser";

const errors: Record<VaultError, string> = {
  "empty-vault": "There is no saved credential to verify your vault password. Create your first credential in the web app, then try again.",
  "unlock-failed": "Unable to unlock. Check your vault password. Damaged or incompatible entries can also prevent unlocking.",
  unauthenticated: "Your session ended. Sign in again before unlocking.",
  unverified: "Verify your email before unlocking your vault.",
  "account-changed": "The signed-in account changed. Refresh your session before unlocking.",
  "invalid-response": "The vault data is invalid or exceeds the supported size. Your vault remains locked.",
  unavailable: "Unable to check your vault or session. Please try again.",
  timeout: "The vault request timed out. Please try again.",
};

export function VaultPanel({ vault }: { vault: ReturnType<typeof useVault> }) {
  const password = useRef<HTMLInputElement>(null);
  const { state } = vault;
  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let value = password.current?.value ?? "";
    if (password.current) password.current.value = "";
    void vault.unlock(value);
    value = "";
  }
  return <>
    {state.status === "unlocked" ? <>
      <div className="flex items-center gap-2"><ShieldCheck size={17} className="text-[#c45b48]" /><h3 className="flex-1 text-xs font-semibold">Your vault is unlocked</h3><button aria-label="Lock vault" className="rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" onClick={vault.lock}><LockKeyhole size={14} /></button></div>
      <p role="status" className="mt-2 text-xs leading-5 text-slate-500">{state.count} {state.count === 1 ? "credential" : "credentials"} decrypted securely.</p>
      <CredentialBrowser vault={vault} />
    </> : <>
      <LockKeyhole size={24} className="text-[#c45b48]" />
      <h3 className="mt-3 text-base font-semibold">Your vault is locked</h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">Enter your vault password to decrypt locally. It stays on this device.</p>
      <form onSubmit={unlock} className="mt-4 space-y-3">
        <div><label htmlFor="vault-password" className="text-xs font-medium">Vault password</label><input ref={password} id="vault-password" type="password" autoComplete="off" required maxLength={1024} disabled={state.status === "unlocking"} className="auth-input mt-1" /></div>
        <button className="primary" disabled={state.status === "unlocking"}>{state.status === "unlocking" ? <><LoaderCircle size={14} className="animate-spin" />Unlocking...</> : "Unlock vault"}</button>
      </form>
      {state.status === "unlocking" && <button className="secondary mt-2" onClick={vault.lock}>Cancel unlock</button>}
    </>}
    {state.error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-700">{errors[state.error]}</p>}
  </>;
}
