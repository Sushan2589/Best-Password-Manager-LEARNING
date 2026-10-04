"use client";

import {
  AlertTriangle,
  Loader2,
  Trash2,
  X,
} from "lucide-react";

import type { DecryptedVaultItem } from "./types";

type DeleteModalProps = {
  item: DecryptedVaultItem | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DeleteModal({
  item,
  deleting,
  onClose,
  onConfirm,
}: DeleteModalProps) {
  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !deleting
        ) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        className="w-full max-w-md overflow-hidden rounded-[24px] bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>

            <div>
              <h2
                id="delete-dialog-title"
                className="text-lg font-bold text-[#18214d]"
              >
                Delete credential?
              </h2>

              <p className="mt-1 text-sm leading-5 text-slate-500">
                You are about to permanently delete{" "}
                <span className="font-semibold text-slate-700">
                  {item.title}
                </span>
                .
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">
            This action cannot be undone. The encrypted
            credential will be permanently removed from your
            vault.
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 p-6 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-60"
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Delete credential
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}