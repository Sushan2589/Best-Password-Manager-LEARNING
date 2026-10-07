"use client";

import AuthInput from "../components/auth/AuthInput";
import AuthShell from "../components/auth/AuthShell";
import { useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const data = {
      username:
        formData.get("username")?.toString() ?? "",
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
        const result = await response.json().catch(() => null);

        if (response.status === 409) {
          setError(
            "An account with this email already exists.",
          );
        } else {
          console.error(result);
          setError("Unable to create your account.");
        }

        return;
      }

      await response.json();

      setRegistered(true);
    } catch (error) {
      console.error(error);
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
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[#c45b48] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b84f3e] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
    )}
  </AuthShell>
)};