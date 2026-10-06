"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  X,
  ChevronDown,
  Search,
} from "lucide-react";

import type { VaultEntry } from "@/lib/validation/vaultEntry";
import PasswordGenerator from "../password-generator/PasswordGenerator";
import { popularWebsites } from "@/data/websites";

type CredentialFormProps = {
  mode: "create" | "edit";
  initialData?: Partial<VaultEntry>;
  saving?: boolean;
  error?: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
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

  const [websiteOpen, setWebsiteOpen] = useState(false);
  const [websiteSearch, setWebsiteSearch] = useState("");

  const [website, setWebsite] = useState(
    initialData?.website ?? "",
  );

  const [customWebsite, setCustomWebsite] = useState(
    Boolean(
      initialData?.website &&
        !popularWebsites.some(
          (site) => site.url === initialData.website,
        ),
    ),
  );

  const isEdit = mode === "edit";

  const filteredWebsites = popularWebsites.filter((site) =>
    site.name.toLowerCase().includes(websiteSearch.toLowerCase()),
  );

  const selectedWebsite = popularWebsites.find(
    (site) => site.url === website,
  );

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
                <label className="mb-2 block text-sm font-semibold">
                  Website
                </label>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setWebsiteOpen((current) => !current)
                    }
                    className="flex w-full items-center justify-between rounded-xl bg-[#f8f8fa] px-4 py-3.5 text-left text-sm ring-1 ring-slate-200 transition hover:bg-white"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {selectedWebsite ? (
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${new URL(
                            selectedWebsite.url,
                          ).hostname}&sz=64`}
                          alt=""
                          className="h-5 w-5 shrink-0 rounded-md"
                        />
                      ) : customWebsite ? (
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-200 text-[10px] font-bold text-slate-500">
                          ↗
                        </div>
                      ) : null}

                      <span
                        className={
                          website
                            ? "truncate text-slate-700"
                            : "text-slate-400"
                        }
                      >
                        {selectedWebsite?.name ??
                          (customWebsite
                            ? "Custom website"
                            : website || "Select a website")}
                      </span>
                    </div>

                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition ${
                        websiteOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {websiteOpen && (
                    <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                      {/* Search */}
                      <div className="border-b border-slate-100 p-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                          <input
                            type="text"
                            value={websiteSearch}
                            onChange={(event) =>
                              setWebsiteSearch(event.target.value)
                            }
                            placeholder="Search websites..."
                            className="w-full rounded-lg bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-[#c45b48]/40"
                          />
                        </div>
                      </div>

                      {/* Website list */}
                      <div className="max-h-64 overflow-y-auto p-2">
                        {filteredWebsites.length > 0 ? (
                          filteredWebsites.map((site) => (
                            <button
                              key={site.url}
                              type="button"
                              onClick={() => {
                                setWebsite(site.url);
                                setCustomWebsite(false);
                                setWebsiteOpen(false);
                                setWebsiteSearch("");
                              }}
                              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 ${
                                website === site.url
                                  ? "bg-slate-50"
                                  : ""
                              }`}
                            >
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${new URL(
                                  site.url,
                                ).hostname}&sz=64`}
                                alt=""
                                className="h-6 w-6 shrink-0 rounded-md"
                              />

                              <span className="font-medium text-slate-700">
                                {site.name}
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-4 text-center text-sm text-slate-400">
                            No websites found
                          </p>
                        )}
                      </div>

                      {/* Always-visible custom option */}
                      <div className="border-t border-slate-100 bg-white p-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCustomWebsite(true);
                            setWebsite("");
                            setWebsiteOpen(false);
                            setWebsiteSearch("");
                          }}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#c45b48] transition hover:bg-[#fff6f3]"
                        >
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#fff0eb] text-sm">
                            +
                          </span>

                          Custom website
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Custom URL */}
                {customWebsite && (
                  <input
                    id="website"
                    type="url"
                    value={website}
                    onChange={(event) =>
                      setWebsite(event.target.value)
                    }
                    placeholder="https://example.com"
                    className="mt-3 w-full rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40"
                  />
                )}

                {/* Actual form value */}
                <input
                  type="hidden"
                  name="website"
                  value={website}
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
                    autoComplete={
                      isEdit ? "new-password" : "off"
                    }
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
              Your credential is encrypted in your browser before it is
              sent to the server.
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