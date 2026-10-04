"use client";

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
    <div className="rounded-[24px] bg-white px-6 py-16 text-center shadow-sm ring-1 ring-slate-100">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-xl">
        {searching ? "⌕" : "🔐"}
      </div>

      <h3 className="mt-5 text-lg font-bold">
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
          className="mt-6 rounded-xl bg-[#c45b48] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b84f3e]"
        >
          Add your first credential
        </button>
      )}
    </div>
  );
}