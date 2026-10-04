"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

type TopbarProps = {
  onLock: () => void;
};

export default function Topbar({ onLock }: TopbarProps) {
  const router = useRouter();

  return (
    <>
      {/* Mobile */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#18214d] text-sm text-white">
            🔐
          </div>

          <span className="font-bold">Password Manager</span>
        </div>

        <button
          type="button"
          onClick={onLock}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Lock
        </button>
      </header>

      {/* Desktop */}
      <div className="mb-8 hidden items-center justify-between md:flex">
        <div>
          <p className="text-sm font-medium text-slate-400">
            Your secure space
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            My Vault
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200"
          >
            <Bell className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => router.push("/account")}
            className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#c45b48] text-sm font-bold text-white">
              U
            </div>

            <span className="text-sm font-semibold">
              My Account
            </span>
          </button>
        </div>
      </div>
    </>
  );
}