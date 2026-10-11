import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Profile } from "../../messaging/auth";
import { RemoteVault } from "./remote";
import { cancelCapture } from "../sites/captureClient";

export function useVault(profile: Profile | null, refreshAccount: () => void) {
  const [session] = useState(() => new RemoteVault());
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (profile) { previous.current = profile.id; void session.refresh(); }
    else { if (previous.current) session.lock(); else session.clear(); previous.current = null; }
  }, [session, profile]);
  useEffect(() => {
    if (["unauthenticated", "unverified", "account-changed"].includes(state.error ?? "")) refreshAccount();
  }, [state.error, refreshAccount]);
  useEffect(() => {
    let lastActivity = 0;
    const activity = (event: Event) => {
      if (!event.isTrusted || Date.now() - lastActivity < 10000) return;
      lastActivity = Date.now(); void session.touch();
    };
    const changed = (message: { type?: string; status?: string }, sender: chrome.runtime.MessageSender) => {
      if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("offscreen.html")) return;
      if (message.type === "session/destroyed") session.clear();
      if (message.type === "session/changed") {
        if (message.status === "locked" && session.getSnapshot().status === "unlocked") session.clear();
        // A locked-state notification must not trigger another auth check and
        // another lock notification indefinitely when the server session ends.
        if (message.status === "unlocked") void session.refresh(); else void session.poll();
      }
    };
    const clear = () => { if (session.policy === 0) session.lock(); session.clear(); };
    chrome.runtime.onMessage.addListener(changed);
    window.addEventListener("pagehide", clear);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    const timer = setInterval(() => { if (session.getSnapshot().status !== "locked") void session.poll(); }, 1000);
    return () => {
      clearInterval(timer); chrome.runtime.onMessage.removeListener(changed);
      window.removeEventListener("pagehide", clear); window.removeEventListener("pointerdown", activity); window.removeEventListener("keydown", activity); clear();
    };
  }, [session]);
  return { state, lock: () => { session.lock(); void cancelCapture().catch(() => {}); }, unlock: (password: string) => session.unlock(password),
    listCredentials: session.listCredentials, readCredential: session.readCredential, authorizeAction: session.authorizeAction, saveEntry: session.saveEntry,
    policy: session.policy, setPolicy: session.setPolicy };
}
