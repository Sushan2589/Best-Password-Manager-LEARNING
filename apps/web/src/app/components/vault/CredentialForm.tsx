"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  X,
} from "lucide-react";

import type { VaultEntry } from "@/lib/validation/vaultEntry";
import PasswordGenerator from "../password-generator/PasswordGenerator";

type CredentialFormProps = {
  mode: "create" | "edit";
  initialData?: Partial<VaultEntry>;
  saving?: boolean;
  error?: string;
  onSubmit: (
    event: React.FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
  onCancel: () => void;
};

export default function CredentialForm({
  mode,
  initialData,
  saving = false,
  error,
  onSubmit,
  onCancel,
}: CredentialFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState(initialData?.password ?? "");
  const [showGenerator, setShowGenerator] = useState(false);

  const isEdit = mode === "edit";

  return (
    <>
      <form onSubmit={onSubmit}>
        <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_20px_60px_rgba(32,35,70,0.06)] ring-1 ring-slate-100">
          <div className="p-5 sm:p-8">
            {/* Credential header */}
            <div className="mb-8 flex items-center gap-4 rounded-2xl bg-[#f5f3f8] p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
                <KeyRound className="h-5 w-5 text-[#18214d]" />
              </div>

              <div>
                <p className="font-semibold">Credential</p>

                <p className="mt-1 text-xs text-slate-400">
                  {isEdit
                    ? "Update login information"
                    : "Login information"}
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Title */}
              <div>
                <label
                  htmlFor="title"
                  className="mb-2 block text-sm font-semibold"
                >
                  Title
                </label>

                <input
                  id="title"
                  name="title"
                  type="text"
                  required
                  defaultValue={initialData?.title ?? ""}
                  placeholder="e.g. Gmail, Netflix, GitHub"
                  className="w-full rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
                />
              </div>

              {/* Website */}
              <div>
                <label
                  htmlFor="website"
                  className="mb-2 block text-sm font-semibold"
                >
                  Website
                </label>

                <input
                  id="website"
                  name="website"
                  type="url"
                  defaultValue={initialData?.website ?? ""}
                  placeholder="https://example.com"
                  className="w-full rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
                />
              </div>

              {/* Username + email */}
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="username"
                    className="mb-2 block text-sm font-semibold"
                  >
                    Username
                  </label>

                  <input
                    id="username"
                    name="username"
                    type="text"
                    defaultValue={initialData?.username ?? ""}
                    placeholder="Your username"
                    className="w-full rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-semibold"
                  >
                    Email
                  </label>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={initialData?.email ?? ""}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-sm font-semibold"
                  >
                    Password
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((current) => !current)
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#c45b48] hover:underline"
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}

                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    placeholder="Enter password"
                    autoComplete={isEdit ? "new-password" : "off"}
                    className="w-full rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 pr-12 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowGenerator(true)}
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#18214d] transition hover:text-[#c45b48]"
                >
                  <KeyRound className="h-4 w-4" />
                  Generate password
                </button>
              </div>

              {/* Notes */}
              <div>
                <label
                  htmlFor="notes"
                  className="mb-2 block text-sm font-semibold"
                >
                  Notes
                </label>

                <textarea
                  id="notes"
                  name="notes"
                  rows={5}
                  defaultValue={initialData?.notes ?? ""}
                  placeholder="Add any additional information..."
                  className="w-full resize-none rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
                />
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/50 p-5 sm:flex-row sm:justify-end sm:p-6">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#c45b48] px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b84f3e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Save Credential"}
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />

          <div>
            <p className="text-xs font-semibold text-slate-600">
              End-to-end encrypted
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-400">
              Your credential is encrypted in your browser before
              it is sent to the server.
            </p>
          </div>
        </div>
      </form>

      {/* Password generator modal */}
      {showGenerator && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#18214d]/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowGenerator(false);
            }
          }}
        >
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white shadow-[0_30px_100px_rgba(24,33,77,0.2)]">
            <button
              type="button"
              onClick={() => setShowGenerator(false)}
              className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-[#18214d]"
              aria-label="Close password generator"
            >
              <X className="h-5 w-5" />
            </button>

            <PasswordGenerator
              mode="embedded"
              onUsePassword={(generatedPassword) => {
                setPassword(generatedPassword);
                setShowGenerator(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}