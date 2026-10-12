"use client";

import AuthInput from "../components/auth/AuthInput";
import AuthShell from "../components/auth/AuthShell";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearVaultKey } from "@/lib/crypto/vaultKeyStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function LoginPage() {
  const router = useRouter();

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((current) => current - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleResendVerification() {
    setResending(true);
    setResendMessage("");

    try {
      const response = await fetch(`${API_URL}/auth/resend-verification`, {
        method: "POST", credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: verificationEmail,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setResendMessage(
          result.message || "Unable to resend verification email.",
        );
        return;
      }

      setResendMessage("Verification email sent. Check your inbox.");
      setResendCooldown(60);
    } catch {
      console.error("Sign-in operation failed.");
      setResendMessage("Unable to connect to the server.");
    } finally {
      setResending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const data = {
      email: formData.get("email")?.toString() ?? "",
      password: formData.get("password")?.toString() ?? "",
      code: formData.get("code")?.toString().trim() || undefined,
    };

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        setError(failure.error === "MFA_REQUIRED" ? "Enter a fresh authenticator or recovery code, then sign in again." : response.status === 429 ? "Too many sign-in attempts. Please wait and try again." : "Invalid email or password.");
        return;
      }

      const result = await response.json();

      clearVaultKey();
      if (!result.user.emailVerified) {
        setVerificationEmail(result.user.email);
        setNeedsVerification(true);
        return;
      }

      router.push("/vault");
    } catch {
      console.error("Sign-in operation failed.");
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={needsVerification ? "Verify your email" : "Welcome back"}
      description={
        needsVerification
          ? "Verify your email before accessing your secure password vault."
          : "Sign in to access your secure password vault."
      }
      footerText="Don't have an account?"
      footerLinkText="Create one"
      footerLinkHref="/register"
    >
      {needsVerification ? (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-2xl">
            ✉
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">
              Verify your email
            </h2>

            <p className="text-sm leading-6 text-gray-500">
              Your account is not verified yet. Please verify your email before
              you can access your password vault.
            </p>

            <p className="break-all text-sm font-medium text-gray-700">
              {verificationEmail}
            </p>
          </div>

          <button
            type="button"
            onClick={handleResendVerification}
            disabled={resending || resendCooldown > 0}
            className="w-full rounded-xl bg-[#c45b48] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b84f3e] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resending
              ? "Sending..."
              : resendCooldown > 0
                ? `Resend available in ${resendCooldown}s`
                : "Resend verification email"}
          </button>

          {resendMessage && (
            <p className="text-sm text-gray-500">{resendMessage}</p>
          )}

          <button
            type="button"
            onClick={() => setNeedsVerification(false)}
            className="text-sm font-medium text-gray-500 transition hover:text-gray-900"
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <AuthInput
            id="email"
            name="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
          />

          <AuthInput
            id="password"
            name="password"
            label="Password"
            type="password"
            placeholder="Enter your password"
            required
            autoComplete="current-password"
          />

          <label className="block text-sm">Authenticator or recovery code (if enabled)<input name="code" autoComplete="one-time-code" maxLength={35} className="mt-2 w-full rounded-xl border p-3" /></label>
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#c45b48] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b84f3e] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
