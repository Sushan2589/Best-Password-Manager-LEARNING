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
  ShieldCheck,
  User,
  Pencil,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
      <main className="min-h-screen bg-[#f6f4f7] px-5 py-8 text-[#18214d]">
        <div className="mx-auto max-w-4xl">
          <div className="h-5 w-28 animate-pulse rounded bg-slate-200" />

          <div className="mt-8 h-32 animate-pulse rounded-[24px] bg-white shadow-sm" />

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="h-56 animate-pulse rounded-[24px] bg-white" />
            <div className="h-56 animate-pulse rounded-[24px] bg-white" />
          </div>
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
            className="mt-4 rounded-xl bg-[#18214d] px-5 py-3 text-sm font-semibold text-white"
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
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:py-10">
        {/* Back */}
        <button
          onClick={() => router.push("/vault")}
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#18214d]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Vault
        </button>

        {/* Header */}
        <section className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[22px] bg-[#18214d] text-2xl font-bold text-white">
              {initial}
            </div>

            <div className="min-w-0">
              <p className="text-sm font-medium text-[#c45b48]">Account</p>

              <h1 className="mt-1 truncate text-3xl font-bold tracking-tight">
                {displayName}
              </h1>

              <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                <Mail className="h-4 w-4" />
                {user.email}
              </p>
            </div>
            <button
              onClick={() => router.push("/account/edit")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <Pencil className="h-4 w-4" />
              Edit profile
            </button>
          </div>
        </section>

        {/* Account information */}
        <section className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef0f8]">
                <User className="h-5 w-5 text-[#18214d]" />
              </div>

              <div>
                <h2 className="font-bold">Personal information</h2>

                <p className="text-xs text-slate-400">Your account details</p>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <p className="text-xs font-medium text-slate-400">Name</p>

                <p className="mt-1 text-sm font-medium text-slate-700">
                  {user.name || "Not set"}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-400">Email</p>

                <p className="mt-1 break-all text-sm font-medium text-slate-700">
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>

              <div>
                <h2 className="font-bold">Security</h2>

                <p className="text-xs text-slate-400">
                  Vault protection status
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <KeyRound className="h-4 w-4 text-slate-500" />

                  <span className="text-sm font-medium text-slate-700">
                    Vault encryption
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Active
                </div>
              </div>

              <p className="text-xs leading-5 text-slate-400">
                Your vault contents are encrypted locally before being sent to
                the server.
              </p>
            </div>
          </div>
        </section>

        {/* Account ID */}
        <section className="mt-5 rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <h2 className="font-bold">Account information</h2>

          <div className="mt-5">
            <p className="text-xs font-medium text-slate-400">Account ID</p>

            <p className="mt-1 break-all font-mono text-xs text-slate-500">
              {user.id}
            </p>
          </div>
        </section>

        {/* Logout */}
        <section className="mt-5 rounded-[24px] border border-red-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-800">Sign out</h2>

              <p className="mt-1 text-sm text-slate-400">
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
      </div>
    </main>
  );
}
