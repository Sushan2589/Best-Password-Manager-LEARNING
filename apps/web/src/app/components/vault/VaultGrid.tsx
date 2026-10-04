"use client";

import type { DecryptedVaultItem } from "./types";
import VaultCard from "./VaultCard";

type VaultGridProps = {
  items: DecryptedVaultItem[];
  showPasswords: Record<string, boolean>;
  onTogglePassword: (id: string) => void;
  onDelete: (item: DecryptedVaultItem) => void;
};

export default function VaultGrid({
  items,
  showPasswords,
  onTogglePassword,
  onDelete,
}: VaultGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <VaultCard
          key={item.id}
          item={item}
          showPassword={Boolean(showPasswords[item.id])}
          onTogglePassword={() =>
            onTogglePassword(item.id)
          }
          onDelete={() => onDelete(item)}
        />
      ))}
    </div>
  );
}