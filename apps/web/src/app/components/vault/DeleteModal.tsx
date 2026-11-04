"use client";
import { Loader2, Trash2 } from "lucide-react";
import Dialog from "../ui/Dialog";
import type { DecryptedVaultItem } from "./types";
export default function DeleteModal({
  item,
  deleting,
  onClose,
  onConfirm,
  error,
}: {
  item: DecryptedVaultItem | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
  error?: string;
}) {
  if (!item) return null;
  return (
    <Dialog
      title={
        item.deletedAt
          ? "Permanently delete credential?"
          : "Move credential to Trash?"
      }
      onClose={onClose}
      busy={deleting}
    >
      <p className="break-words text-sm text-slate-600">
        {item.deletedAt ? "Permanently delete" : "Move"}{" "}
        <strong>{item.title}</strong>
        {item.deletedAt
          ? "? This action cannot be undone."
          : " to Trash? You can restore it later."}
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button
          autoFocus
          disabled={deleting}
          onClick={onClose}
          className="rounded-lg border px-4 py-3 text-sm"
        >
          Cancel
        </button>
        <button
          disabled={deleting}
          onClick={onConfirm}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {deleting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Trash2 size={16} />
          )}
          {deleting
            ? "Deleting..."
            : item.deletedAt
              ? "Permanently delete"
              : "Move to Trash"}
        </button>
      </div>
    </Dialog>
  );
}
