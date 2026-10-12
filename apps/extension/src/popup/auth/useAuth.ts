import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthError, AuthRequest, AuthResult, Profile } from "../../messaging/auth";
import { authRequest } from "./client";

export type AccountState = { state: "checking" | "signed-out" | "error" } | { state: "signed-in"; profile: Profile };
export const AUTH_ERRORS: Record<AuthError, string> = {
  "mfa-required": "Enter a fresh authenticator code or recovery code and sign in again.",
  "invalid-credentials": "Invalid email or password.",
  "invalid-input": "Please check your email and password.",
  unavailable: "Unable to connect. Please try again.",
  timeout: "The request timed out. Please try again.",
  "invalid-response": "The server returned an unexpected response. Please try again.",
  forbidden: "This extension is not authorized by your password manager. Check the server configuration.",
  "cookie-unavailable": "Your session cookie was not accepted. Check your browser cookie settings and try again.",
  "rate-limited": "Please wait before trying again.",
};

export function useAuth() {
  const [account, setAccount] = useState<AccountState>({ state: "checking" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const epoch = useRef(0);
  const pending = useRef(false);
  const pendingType = useRef<AuthRequest["type"] | null>(null);
  const current = useRef(account);
  const loggedOutLocally = useRef(false);
  current.current = account;

  const apply = useCallback((result: AuthResult) => {
    if (!result.ok) {
      // Fail closed, including connectivity failures during session revalidation.
      setNotice("");
      setAccount({ state: "error" });
      setError(AUTH_ERRORS[result.error]);
    } else if (result.state === "signed-in") {
      const previous = current.current;
      if (previous.state !== "signed-in" || previous.profile.id !== result.profile.id || previous.profile.emailVerified !== result.profile.emailVerified) setNotice("");
      setAccount({ state: "signed-in", profile: result.profile });
    } else if (result.state === "signed-out") {
      if (current.current.state === "signed-in") setNotice("Your session has ended. Please sign in again.");
      setAccount({ state: "signed-out" });
    }
  }, []);

  const run = useCallback(async (request: AuthRequest) => {
    // Focus can start a check between pointer-down and click, before React
    // disables the control. Prioritize the explicit action instead of losing
    // it; the epoch discards the superseded session check's result.
    if (pending.current && (request.type === "auth/session" || pendingType.current !== "auth/session")) return;
    if (request.type === "auth/session" && loggedOutLocally.current) return;
    if (request.type === "auth/login") loggedOutLocally.current = false;
    pending.current = true;
    pendingType.current = request.type;
    const generation = ++epoch.current;
    // Background revalidation must not disable a control halfway through a
    // user's click. Pending/epoch refs still serialize checks and user actions.
    setBusy(request.type !== "auth/session"); setError("");
    if (request.type !== "auth/session") setNotice("");
    const result = await authRequest(request);
    if (generation !== epoch.current) return;
    pending.current = false;
    pendingType.current = null;
    setBusy(false);
    if (request.type === "auth/resend" && result.ok && result.state === "verification-sent") {
      setNotice("Verification email sent. Check your inbox."); setCooldownUntil(Date.now() + 60000);
    } else if (request.type === "auth/login" && !result.ok) {
      setAccount({ state: "signed-out" }); setError(AUTH_ERRORS[result.error]);
    } else if (request.type === "auth/resend" && !result.ok) {
      setError(AUTH_ERRORS[result.error]);
      if (result.error === "rate-limited") setCooldownUntil(Date.now() + 60000);
    } else { apply(result); }
    return result;
  }, [apply]);

  useEffect(() => {
    pending.current = false;
    pendingType.current = null;
    void run({ type: "auth/session" });
    const timer = setInterval(() => { if (!pending.current) void run({ type: "auth/session" }); }, 60000);
    const focus = () => { if (!pending.current) void run({ type: "auth/session" }); };
    window.addEventListener("focus", focus);
    return () => { ++epoch.current; pending.current = false; pendingType.current = null; clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [run]);

  useEffect(() => {
    if (account.state !== "signed-in") return;
    const remaining = Date.parse(account.profile.sessionExpiresAt) - Date.now();
    const timer = setTimeout(() => {
      ++epoch.current; pending.current = false; pendingType.current = null;
      setBusy(false); setAccount({ state: "signed-out" });
      setNotice("Your session has expired. Please sign in again.");
    }, Math.max(0, Math.min(remaining, 2147483647)));
    return () => clearTimeout(timer);
  }, [account]);

  async function logout() {
    if (pending.current && pendingType.current !== "auth/session") return;
    ++epoch.current;
    loggedOutLocally.current = true;
    setAccount({ state: "signed-out" }); setNotice(""); setError(""); setCooldownUntil(0);
    const result = await run({ type: "auth/logout" });
    // Keep local state signed out even when server revocation fails.
    if (result && !result.ok) {
      setAccount({ state: "signed-out" });
      setError("Signed out locally, but server logout could not be confirmed. Retry logout before leaving.");
    }
  }

  return { account, busy, notice, error, cooldownUntil, run, logout };
}
