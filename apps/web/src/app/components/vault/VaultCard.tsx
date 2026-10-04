"use client";

import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Pencil,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DecryptedVaultItem } from "./types";

type VaultCardProps = {
  item: DecryptedVaultItem;
  showPassword: boolean;
  onTogglePassword: () => void;
  onDelete: () => void;
};

export default function VaultCard({
  item,
  showPassword,
  onTogglePassword,
  onDelete,
}: VaultCardProps) {
  const router = useRouter();

  const [copiedField, setCopiedField] = useState<
    "username" | "password" | null
  >(null);

  function getInitial(title: string) {
    return title?.charAt(0)?.toUpperCase() || "?";
  }

  function getHostname(url?: string) {
    if (!url) return "";

    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  }

  async function copyToClipboard(
    value: string | undefined,
    field: "username" | "password",
  ) {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);

      setCopiedField(field);

      setTimeout(() => {
        setCopiedField(null);
      }, 1500);
    } catch {
      // Clipboard access can fail if the browser blocks it.
    }
  }

  const hostname = getHostname(item.website);

  const username = item.username || item.email;

  return (
    <article className="group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eef0f8] text-base font-bold text-[#20285e]">
            {getInitial(item.title)}
          </div>

          <div className="min-w-0">
            <h4 className="truncate text-sm font-bold text-slate-900">
              {item.title || "Untitled credential"}
            </h4>

            {hostname ? (
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
                <Globe className="h-3 w-3 shrink-0" />

                <span className="truncate">{hostname}</span>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-400">
                No website
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onTogglePassword}
          className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label={showPassword ? "Hide password" : "Show password"}
          title={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Credential details */}
      <div className="mt-5 divide-y divide-slate-200/70 rounded-xl border border-slate-100 bg-slate-50/70">
        {username && (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Username
              </p>

              <p className="mt-1 truncate text-sm text-slate-700">
                {username}
              </p>
            </div>

            <button
              type="button"
              onClick={() => copyToClipboard(username, "username")}
              className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-slate-700"
              aria-label="Copy username"
              title="Copy username"
            >
              {copiedField === "username" ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Password
            </p>

            <p
              className={`mt-1 truncate font-mono text-sm ${
                showPassword ? "text-slate-700" : "tracking-[0.18em] text-slate-500"
              }`}
            >
              {showPassword
                ? item.password || "No password"
                : "••••••••••••"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => copyToClipboard(item.password, "password")}
            disabled={!item.password}
            className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Copy password"
            title="Copy password"
          >
            {copiedField === "password" ? (
              <Check className="h-4 w-4 text-emerald-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto flex items-center justify-between pt-4">
        <button
          type="button"
          onClick={() => router.push(`/vault/${item.id}/edit`)}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#20285e] transition hover:bg-[#eef0f8]"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </article>
  );
}