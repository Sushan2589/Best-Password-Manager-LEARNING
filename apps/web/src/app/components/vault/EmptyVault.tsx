"use client";

import { LockKeyhole as VaultMark } from "lucide-react";

type EmptyVaultProps = {
  search: string;
  onAdd: () => void;
};

export default function EmptyVault({
  search,
  onAdd,
}: EmptyVaultProps) {
  const searching = Boolean(search.trim());

  return (
    <div className="rounded-2xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-slate-100">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-xl">
        <VaultMark size={20} strokeWidth={1.5} aria-hidden="true" />
      </div>

      <h3 className="mt-5 text-lg font-medium">
        {searching
          ? "No credentials found"
          : "Your vault is empty"}
      </h3>

      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">
        {searching
          ? "Try searching with a different title, username, email, or website."
          : "Add your first credential to start building your secure vault."}
      </p>

      {!searching && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-6 rounded-xl bg-[#a34536] px-5 py-3 text-sm font-semibold text-white transition enabled:hover:bg-[#89392d]"
        >
          Add your first credential
        </button>
      )}
    </div>
  );
}