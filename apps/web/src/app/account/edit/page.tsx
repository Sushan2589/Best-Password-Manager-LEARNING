"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Mail, User } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type UserProfile = {
  id: string;
  email: string;
  name: string | null;
  vaultSalt: string;
};

export default function EditProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const response = await fetch(`${API_URL}/user/me`, {
          credentials: "include",
        });

        if (response.status === 401) {
          router.push("/login");
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to load profile.");
        }

        const data: UserProfile = await response.json();

        setUser(data);
        setName(data.name ?? "");
        setEmail(data.email);
      } catch (error) {
        console.error(error);
        setError("Unable to load your profile.");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedName.length < 2 || trimmedName.length > 50) {
      setError("Name must be between 2 and 50 characters.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(`${API_URL}/user/me`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
        }),
      });

      const responseText = await response.text();

      let data: UserProfile | { error?: string };

      try {
        data = JSON.parse(responseText);
      } catch {
        console.error("Invalid API response:", responseText);
        throw new Error("Unable to update your profile.");
      }

      if (!response.ok) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Unable to update your profile.",
        );
      }

      setUser(data as UserProfile);
      setName((data as UserProfile).name ?? "");
      setEmail((data as UserProfile).email);

      setSuccess("Your profile has been updated.");


      setTimeout(() => {
        router.push("/account");
      }, 800);
} catch (error) {
  console.error("Profile update failed:", error);

  setError(
    error instanceof Error
      ? error.message
      : "Unable to update your profile."
  );
} finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f6f4f7] px-5 py-8 text-[#18214d]">
        <div className="mx-auto max-w-2xl">
          <div className="h-5 w-28 animate-pulse rounded bg-slate-200" />

          <div className="mt-8 rounded-[28px] bg-white p-8 shadow-sm">
            <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
            <div className="mt-8 h-14 animate-pulse rounded-xl bg-slate-100" />
            <div className="mt-5 h-14 animate-pulse rounded-xl bg-slate-100" />
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
            onClick={() => router.push("/account")}
            className="mt-4 rounded-xl bg-[#18214d] px-5 py-3 text-sm font-semibold text-white"
          >
            Back to Account
          </button>
        </div>
      </main>
    );
  }

  const initial = (name.trim() || "U").charAt(0).toUpperCase();

  return (
    <main className="min-h-screen bg-[#f6f4f7] text-[#18214d]">
      <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:py-10">
        {/* Back */}
        <button
          onClick={() => router.push("/account")}
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#18214d]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Account
        </button>

        {/* Header */}
        <div className="mb-6">
          <p className="text-sm font-medium text-[#c45b48]">Account</p>

          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Edit profile
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Update your personal information.
          </p>
        </div>

        {/* Profile preview */}
        <section className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100 sm:p-8">
          <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#18214d] text-xl font-bold text-white">
              {initial}
            </div>

            <div className="min-w-0">
              <p className="truncate font-bold">{name.trim() || "Your name"}</p>

              <p className="mt-1 truncate text-sm text-slate-400">
                {email || "your@email.com"}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-6">
            {/* Name */}
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Full name
              </label>

              <div className="relative">
                <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                    setSuccess("");
                  }}
                  maxLength={50}
                  placeholder="Your name"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-[#18214d] focus:ring-2 focus:ring-[#18214d]/10"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Email address
              </label>

              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                    setSuccess("");
                  }}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-[#18214d] focus:ring-2 focus:ring-[#18214d]/10"
                />
              </div>

              <p className="mt-2 text-xs leading-5 text-slate-400">
                Make sure you have access to this email address.
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => router.push("/account")}
                disabled={saving}
                className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#18214d] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#10183c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving changes...
                  </>
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
