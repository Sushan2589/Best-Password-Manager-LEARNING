type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
};

export default function SearchBar({
  value,
  onChange,
  onAdd,
}: SearchBarProps) {
  return (
    <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-md">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          ⌕
        </span>

        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search your vault..."
          className="w-full rounded-xl border-0 bg-white py-3.5 pl-11 pr-4 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:ring-2 focus:ring-[#c45b48]/40"
        />
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#c45b48] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b84f3e]"
      >
        <span className="text-lg leading-none">+</span>
        Add Credential
      </button>
    </section>
  );
}