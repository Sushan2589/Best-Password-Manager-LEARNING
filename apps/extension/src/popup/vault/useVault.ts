import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { Profile } from "../../messaging/auth";
import { authRequest } from "../auth/client";
import { fetchVaultSnapshot } from "./client";
import { VaultSession } from "./session";

export function useVault(profile: Profile | null, refreshAccount: () => void) {
  const [session] = useState(() => new VaultSession({ snapshot: fetchVaultSnapshot,
    validateSession: () => authRequest({ type: "auth/session" }) }));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useLayoutEffect(() => { session.setAccount(profile); }, [session, profile]);
  useEffect(() => {
    if (["unauthenticated", "unverified", "account-changed"].includes(state.error ?? "")) refreshAccount();
  }, [state.error, refreshAccount]);
  useEffect(() => {
    const clear = () => session.lock();
    window.addEventListener("pagehide", clear);
    return () => { window.removeEventListener("pagehide", clear); session.lock(); };
  }, [session]);
  return { state, lock: session.lock, unlock: (password: string) => session.unlock(password),
    listCredentials: session.listCredentials, readCredential: session.readCredential };
}
