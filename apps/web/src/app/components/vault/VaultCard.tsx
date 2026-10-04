"use client";

import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

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

  function getInitial(title: string) {
    return title.charAt(0).toUpperCase();
  }

  function getHostname(url?: string) {
    if (!url) return "";

    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  }

  return (
    <article className="group rounded-[22px] bg-white p-5 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eef0f8] text-lg font-bold text-[#20285e]">
            {getInitial(item.title)}
          </div>

          <div className="min-w-0">
            <h4 className="truncate font-bold">
              {item.title}
            </h4>

            <p className="mt-0.5 truncate text-xs text-slate-400">
              {getHostname(item.website) ||
                item.email ||
                item.username ||
                "Credential"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onTogglePassword}
          className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label={
            showPassword ? "Hide password" : "Show password"
          }
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="mt-5 space-y-3 rounded-xl bg-[#f8f8fa] p-4">
        {(item.username || item.email) && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Username
            </p>

            <p className="mt-1 truncate text-sm text-slate-700">
              {item.username || item.email}
            </p>
          </div>
        )}

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Password
          </p>

          <p className="mt-1 truncate font-mono text-sm text-slate-700">
            {showPassword
              ? item.password
              : "••••••••••••"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            router.push(`/vault/${item.id}/edit`)
          }
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