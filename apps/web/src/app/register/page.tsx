"use client";

import AuthInput from "../components/auth/AuthInput";
import AuthShell from "../components/auth/AuthShell";
import { useState } from "react";

import { API_URL } from "@/lib/api";

export default function RegisterPage() {

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();

    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const password =
      formData.get("password")?.toString() ?? "";

    const confirmPassword =
      formData.get("confirmPassword")?.toString() ?? "";

    const username = formData.get("username")?.toString() ?? "";
    if (username.length < 3 || username.length > 20) {
      setError("Use a username between 3 and 20 characters."); setLoading(false); return;
    }

    if ([...password].length < 15) { setError("Use at least 15 characters for your account password."); setLoading(false); return; }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const data = {
      username,
      email:
        formData.get("email")?.toString() ?? "",
      password,
    };

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const message = result && typeof result === "object" && "error" in result ? result.error : undefined;
        if (response.status === 409) {
          setError(
            "An account with this email already exists.",
          );
        } else if (response.status === 400) {
          setError(message === "Choose a password that has not appeared in a breach."
            ? "This password has appeared in a data breach. Choose a different password."
            : "Check your details: username must be 3–20 characters, email must be valid, and password must be at least 15 characters.");
        } else if (response.status === 429) {
          setError("Too many registration attempts. Please wait before trying again.");
        } else if (response.status === 503) {
          setError("Registration is temporarily unavailable. Please try again shortly.");
        } else if (response.status === 403) {
          setError("Registration was blocked. Open passwordmanager.sushandahal.com.np and try again.");
        } else {
          console.error("Registration request failed.");
          setError("Unable to create your account because of a server error. Please try again shortly.");
        }

        return;
      }

      await response.json();

      setRegistered(true);
    } catch {
      console.error("Registration request failed.");
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
  <AuthShell
    title={registered ? "Verify your email" : "Create your account"}
    description={
      registered
        ? "We've sent a verification link to your email. Please verify your email before accessing your vault."
        : "Create your account and start building your secure vault."
    }
    footerText="Already have an account?"
    footerLinkText="Sign in"
    footerLinkHref="/login"
  >
    {registered ? (
      <div className="space-y-4 text-center">
        <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
          Verification email sent successfully.
        </div>

        <p className="text-sm text-gray-500">
          Check your inbox and click the verification link to continue.
        </p>
      </div>
    ) : (
      <form onSubmit={handleSubmit} className="space-y-5">
        <AuthInput
          id="username"
          name="username"
          label="Username"
          placeholder="Choose a username"
          required
          autoComplete="username"
        />

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
          placeholder="Create a password"
          required
          autoComplete="new-password"
        />

        <AuthInput
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm password"
          type="password"
          placeholder="Enter your password again"
          required
          autoComplete="new-password"
        />

        {error && (
          <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[#c45b48] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-[#b84f3e] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
    )}
  </AuthShell>
)};
