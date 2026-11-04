"use client";

import { useState } from "react";
import type { DecryptedVaultItem } from "./types";
import VaultCard from "./VaultCard";

type VaultGridProps = {
  items: DecryptedVaultItem[];
  showPasswords: Record<string, boolean>;
  onTogglePassword: (id: string) => void;
  onDelete: (item: DecryptedVaultItem) => void;
  onView: (id: string) => void;
  onFavorite: (item: DecryptedVaultItem) => void;
  favoritePending: string | null;
};

export default function VaultGrid({
  items,
  showPasswords,
  onTogglePassword,
  onDelete,
  onView,
  onFavorite,
  favoritePending,
}: VaultGridProps) {
  const [limit, setLimit] = useState(60);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, limit).map((item) => (
          <VaultCard
            key={item.id}
            item={item}
            onView={() => onView(item.id)}
            onFavorite={() => onFavorite(item)}
            favoritePending={favoritePending !== null}
            showPassword={Boolean(showPasswords[item.id])}
            onTogglePassword={() => onTogglePassword(item.id)}
            onDelete={() => onDelete(item)}
          />
        ))}
      </div>
      {items.length > limit && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setLimit((value) => value + 60)}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Show more ({Math.min(limit, items.length)} of {items.length})
          </button>
        </div>
      )}
    </>
  );
}
