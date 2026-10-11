import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, KeyRound, LoaderCircle, LockKeyhole, RefreshCw, Settings, ShieldCheck, Wifi } from "lucide-react";
import type { ConnectionResult } from "../messaging/protocol";
import { API_ORIGIN } from "../config/runtime";
import { requestConnectionCheck } from "./connection";
import { useAuth } from "./auth/useAuth";
import { AccountPanel } from "./auth/AccountPanel";
import { useVault } from "./vault/useVault";

type Screen = "vault" | "generator" | "settings";

export function App() {
  const auth = useAuth();
  const refreshAccount = useCallback(() => { void auth.run({ type: "auth/session" }); }, [auth.run]);
  const vault = useVault(auth.account.state === "signed-in" ? auth.account.profile : null, refreshAccount);
  const [screen, setScreen] = useState<Screen>("vault");
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState<ConnectionResult | null>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function check() {
    if (pending.current) return;
    pending.current = true;
    setChecking(true);
    const result = await requestConnectionCheck();
    pending.current = false;
    if (alive.current) {
      setConnection(result);
      setChecking(false);
    }
  }

  const connectionText = checking ? "Checking connection…" : connection?.ok
    ? "Your password manager is reachable."
    : connection ? (connection.error === "timeout" ? "The connection timed out. Please try again." : "Unable to reach your password manager. Please try again.")
    : "Check that your password manager is available.";

  return (
    <div className="flex max-h-[600px] min-h-[520px] flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200/70 bg-white px-6 py-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#18214d] text-white"><LockKeyhole size={20} /></div>
        <div className="flex-1"><h1 className="text-sm font-bold tracking-tight">Password Manager</h1><p className="mt-0.5 text-xs text-slate-500">Your secure space</p></div>
        <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600"><LockKeyhole size={11} />{vault.state.status === "unlocked" ? "Unlocked" : "Locked"}</span>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {screen === "vault" && <>
          {vault.state.status === "unlocked" ? <h2 className="text-xl font-bold tracking-tight">Your credentials</h2> : <>
            <p className="text-xs font-semibold text-[#c45b48]">WELCOME TO YOUR VAULT</p>
            <h2 className="mt-2 text-[23px] font-bold tracking-tight">Your vault, within reach.</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">A private place for your everyday credentials.</p>
          </>}
          <AccountPanel auth={auth} vault={vault} />
        </>}
        {screen === "generator" && <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <KeyRound className="mx-auto text-[#c45b48]" size={28} />
          <h2 className="mt-4 text-lg font-bold">Password generator</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">Generate and copy strong passwords here in a future update.</p>
        </section>}
        {screen === "settings" && <>
          <h2 className="text-xl font-bold">Settings</h2>
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold">Vault locking</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">The vault will lock when you close this popup.</p>
          </section>
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold">Connection</h3>
            <p className="mt-2 break-all text-xs leading-5 text-slate-500">{API_ORIGIN}</p>
          </section>
          <ConnectionCard checking={checking} connection={connection} text={connectionText} onCheck={() => void check()} />
        </>}
      </main>

      <div className="flex shrink-0 items-center justify-center gap-2 px-6 pb-3 text-[11px] text-slate-500"><ShieldCheck size={14} />Your vault stays private.</div>
      <nav aria-label="Main navigation" className="grid shrink-0 grid-cols-3 border-t border-slate-200/70 bg-white p-2">
        {([{ id: "vault", label: "Vault", Icon: LockKeyhole }, { id: "generator", label: "Generator", Icon: KeyRound }, { id: "settings", label: "Settings", Icon: Settings }] as const).map(({ id, label, Icon }) =>
          <button key={id} type="button" onClick={() => setScreen(id)} aria-current={screen === id ? "page" : undefined}
            className={`flex flex-col items-center gap-1.5 rounded-xl py-3 text-[11px] font-semibold transition-colors ${screen === id ? "bg-[#c45b48]/8 text-[#c45b48]" : "text-slate-500 hover:bg-slate-50"}`}><Icon size={18} />{label}</button>)}
      </nav>
    </div>
  );
}

function ConnectionCard({ checking, connection, text, onCheck }: {
  checking: boolean; connection: ConnectionResult | null; text: string; onCheck: () => void;
}) {
  return <section className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-4">
    <div className="flex items-center gap-2 text-xs font-semibold"><Wifi size={15} />Connection</div>
    <div role="status" aria-live="polite" className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-500">
      {checking ? <LoaderCircle size={14} className="mt-0.5 shrink-0 animate-spin" /> : connection?.ok ? <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" /> : connection ? <CircleAlert size={14} className="mt-0.5 shrink-0 text-[#c45b48]" /> : null}
      <span>{text}</span>
    </div>
    <button type="button" onClick={onCheck} disabled={checking} className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#c45b48] hover:text-[#b84f3e] disabled:opacity-50"><RefreshCw size={13} />{checking ? "Checking…" : connection ? "Check again" : "Check connection"}</button>
  </section>;
}
