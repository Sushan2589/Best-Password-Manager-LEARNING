"use client";
import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Star, ExternalLink } from "lucide-react";
import { credentialVersionChanges, type VaultEntry } from "@password-manager/shared";
import type { DecryptedVaultItem } from "./types";
import Dialog from "../ui/Dialog";
import CopyButton from "../ui/CopyButton";
export default function CredentialDetails({
  item,
  onClose,
  onFavorite,
  onRestore,
  busy,
}: {
  item: DecryptedVaultItem;
  onClose: () => void;
  onFavorite: () => void;
  busy: boolean;
  onRestore: (changes: Partial<VaultEntry>) => void;
}) {
  const [reveal, setReveal] = useState(false);
  let website: URL | null = null;
  try {
    const parsed = new URL(item.website || "");
    if (
      ["https:", "http:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
    )
      website = parsed;
  } catch {
    /* Invalid legacy addresses are not opened. */
  }
  return (
    <Dialog title={item.title} onClose={onClose} busy={busy}>
      <div className="space-y-5">
        <p role="status" className="min-h-5 text-xs text-slate-500">
          {busy ? "Saving changes..." : ""}
        </p>
        <button
          onClick={onFavorite}
          disabled={busy}
          aria-pressed={Boolean(item.favorite)}
          className="inline-flex items-center gap-2 rounded-lg border p-2 text-sm"
        >
          <Star size={16} fill={item.favorite ? "currentColor" : "none"} />
          {item.favorite ? "Favorite" : "Add to favorites"}
        </button>
        {(
          [
            ["Username", item.username],
            ["Email", item.email],
          ] as const
        ).map(
          ([label, value]) =>
            value && (
              <div key={label}>
                <p className="text-xs text-slate-500">{label}</p>
                <div className="flex items-center justify-between gap-3">
                  <p className="break-all">{value}</p>
                  <CopyButton
                    value={value}
                    label={`Copy ${label.toLowerCase()}`}
                  />
                </div>
              </div>
            ),
        )}
        <div>
          <p className="text-xs text-slate-500">Password</p>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 break-all font-mono">
              {reveal ? item.password : "••••••••••••"}
            </span>
            <button
              aria-label={reveal ? "Hide password" : "Reveal password"}
              aria-pressed={reveal}
              onClick={() => setReveal(!reveal)}
              className="flex h-11 w-11 items-center justify-center rounded-lg p-2 hover:bg-slate-100"
            >
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <CopyButton value={item.password} label="Copy password" />
          </div>
        </div>
        {website && (
          <a
            href={website.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 break-all text-sm text-[#c45b48]"
          >
            {website.host}
            <ExternalLink size={16} />
          </a>
        )}
        {item.notes && (
          <div>
            <p className="text-xs text-slate-500">Notes</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">
              {item.notes}
            </p>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-4 text-xs text-slate-500">
          {(
            [
              ["Created", item.createdAt],
              ["Updated", item.updatedAt],
            ] as const
          ).map(([label, date]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="mt-1">
                {date ? new Date(date).toLocaleString() : "Unavailable"}
              </dd>
            </div>
          ))}
        </dl>
        {item.deletedAt && (
          <button
            disabled={busy}
            onClick={() => onRestore({ deletedAt: null })}
            className="rounded-lg bg-[#c45b48] px-4 py-3 text-sm text-white"
          >
            Restore from Trash
          </button>
        )}
        {Boolean(item.history?.length) && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-semibold">
              Previous versions ({item.history!.length})
            </summary>
            <p className="my-3 text-xs text-slate-500">
              The last ten changed versions are encrypted with this credential.
            </p>
            <button
              disabled={busy}
              className="mb-3 text-xs text-red-600"
              onClick={() => {
                if (
                  window.confirm(
                    "Permanently clear the previous versions? The current credential will be kept.",
                  )
                )
                  onRestore({ history: [] });
              }}
            >
              Clear history
            </button>
            {item.history!.map((version, index) => (
              <div
                key={`${version.savedAt}:${index}`}
                className="flex items-center justify-between gap-3 border-t py-3 text-xs"
              >
                <span>{new Date(version.savedAt).toLocaleString()}</span>
                <button
                  disabled={busy}
                  className="rounded-lg border px-3 py-2"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Restore this version? The current version will be kept in history.",
                      )
                    )
                      onRestore(credentialVersionChanges(version.entry));
                  }}
                >
                  Restore version
                </button>
              </div>
            ))}
          </details>
        )}
        {!item.deletedAt && (
          <Link
            href={`/vault/${item.id}/edit`}
            className="inline-block rounded-lg bg-[#c45b48] px-4 py-3 text-sm font-semibold text-white"
          >
            Edit credential
          </Link>
        )}
      </div>
    </Dialog>
  );
}
