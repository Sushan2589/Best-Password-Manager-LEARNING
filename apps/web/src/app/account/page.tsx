"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  ShieldCheck,
  User,
} from "lucide-react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type UserProfile = {
  id: string;
  email: string;
  name: string | null;
  vaultSalt: string;
};

export default function AccountPage() {
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        const response = await fetch(`${API_URL}/user/me`, {
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 401) {
            router.push("/login");
            return;
          }

          throw new Error("Failed to load profile.");
        }

        const data = await response.json();

        setUser(data);
      } catch (error) {
        console.error(error);
        setError("Unable to load your profile.");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [router]);

  async function handleLogout() {
    try {
      setLoggingOut(true);

      const response = await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Logout failed.");
      }

      router.push("/login");
    } catch (error) {
      console.error(error);
      setLoggingOut(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f4f7] px-5 py-10 text-[#18214d] sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="h-5 w-28 animate-pulse rounded bg-slate-200" />

          <div className="mt-8 h-44 animate-pulse rounded-[28px] bg-white shadow-sm" />

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="h-64 animate-pulse rounded-[24px] bg-white" />
            <div className="h-64 animate-pulse rounded-[24px] bg-white" />
          </div>

          <div className="mt-6 h-32 animate-pulse rounded-[24px] bg-white" />
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f4f7] px-5">
        <div className="text-center">
          <p className="text-sm text-slate-500">
            {error || "Unable to load profile."}
          </p>

          <button
            onClick={() => router.push("/vault")}
            className="mt-4 rounded-xl bg-[#18214d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#10183c]"
          >
            Back to Vault
          </button>
        </div>
      </main>
    );
  }

  const displayName = user.name || "User";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <main className="min-h-screen bg-[#f6f4f7] text-[#18214d]">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        {/* Back */}
        <button
          onClick={() => router.push("/vault")}
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#18214d]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Vault
        </button>

        {/* Page heading */}
        <div className="mb-8">
          <p className="text-sm font-medium text-[#c45b48]">
            Account
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            Account settings
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Manage your profile and review the security of your
            password vault.
          </p>
        </div>

        {/* Profile header */}
        <section className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-5">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[24px] bg-[#18214d] text-2xl font-bold text-white shadow-sm">
                {initial}
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Profile
                </p>

                <h2 className="mt-1 truncate text-2xl font-bold">
                  {displayName}
                </h2>

                <div className="mt-2 flex min-w-0 items-center gap-2 text-sm text-slate-400">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push("/account/edit")}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <Pencil className="h-4 w-4" />
              Edit profile
            </button>
          </div>
        </section>

        {/* Main account sections */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Personal information */}
          <section className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eef0f8]">
                <User className="h-5 w-5 text-[#18214d]" />
              </div>

              <div>
                <h2 className="font-bold">
                  Personal information
                </h2>

                <p className="mt-1 text-xs text-slate-400">
                  Your basic account details
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Full name
                </p>

                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {user.name || "Not set"}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Email address
                </p>

                <p className="mt-2 break-all text-sm font-semibold text-slate-700">
                  {user.email}
                </p>
              </div>
            </div>
          </section>

          {/* Security */}
          <section className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>

              <div>
                <h2 className="font-bold">Security</h2>

                <p className="mt-1 text-xs text-slate-400">
                  Vault protection status
                </p>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <KeyRound className="h-4 w-4 text-slate-500" />

                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      Vault encryption
                    </p>

                    <p className="mt-0.5 text-xs text-slate-400">
                      Client-side encryption
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Active
                </div>
              </div>

              <p className="mt-4 text-xs leading-5 text-slate-400">
                Your vault contents are encrypted locally before
                being sent to the server.
              </p>
            </div>
          </section>
        </div>

        {/* Technical account information */}
        <section className="mt-6 rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100 sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <KeyRound className="h-4 w-4 text-slate-500" />
            </div>

            <div>
              <h2 className="font-bold">
                Account information
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                Technical information associated with your account
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-slate-50 px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Account ID
            </p>

            <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-500">
              {user.id}
            </p>
          </div>
        </section>

        {/* Sign out */}
        <section className="mt-6 rounded-[24px] border border-red-100 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-800">
                Sign out
              </h2>

              <p className="mt-1 text-sm leading-5 text-slate-400">
                End your current session on this device.
              </p>
            </div>

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-5 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingOut ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing out...
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </>
              )}
            </button>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-slate-400">
          Keep your account information up to date.
        </p>
      </div>
    </main>
  );
}