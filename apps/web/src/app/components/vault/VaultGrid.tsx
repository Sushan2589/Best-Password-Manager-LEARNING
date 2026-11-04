"use client";

import type { DecryptedVaultItem } from "./types";
import Link from "next/link";
import WebsiteIcon from "./WebsiteIcon";
import VaultCard from "./VaultCard";

type VaultGridProps = {
  layout?: string;
  items: DecryptedVaultItem[];
  showPasswords: Record<string, boolean>;
  onTogglePassword: (id: string) => void;
  onDelete: (item: DecryptedVaultItem) => void;
};

export default function VaultGrid({
  layout,
  items,
  showPasswords,
  onTogglePassword,
  onDelete,
}: VaultGridProps) {
  if (layout === "list") return <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{items.map(item => <div key={item.id} className="flex items-center gap-3 p-3 hover:bg-slate-50">
    <WebsiteIcon website={item.website} title={item.title} />
    <Link className="min-w-0 flex-1" href={`/vault/${item.id}/edit`}><span className="block truncate text-sm font-semibold">{item.favorite ? "? " : ""}{item.title}</span><span className="block truncate text-xs text-slate-500">{item.username || item.email} ? {item.website ? new URL(item.website).hostname : "No website"}</span></Link>
    <span className="hidden text-xs text-slate-500 sm:block">{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ""}</span>
    <button aria-label={`Delete ${item.title}`} className="rounded-lg p-2 text-xs text-red-600 hover:bg-red-50" onClick={() => onDelete(item)}>Delete</button>
  </div>)}</div>;
  return (
    <div className={layout === "list" ? "grid gap-2" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"}>
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