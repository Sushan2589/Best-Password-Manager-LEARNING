"use client";

import { LockKeyhole, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";

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

    <div>
      <p className="text-sm font-bold text-slate-900">
        Password Manager
      </p>
      <p className="text-[11px] text-slate-400">
        My Vault
      </p>
    </div>
  </div>

  <div className="flex items-center gap-1">
    

    <button
      type="button"
      onClick={onLock}
      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
      aria-label="Lock vault"
    >
      <LockKeyhole className="h-5 w-5" />
    </button>

    <button
      type="button"
      onClick={() => router.push("/account")}
      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
      aria-label="Account"
    >
      <UserCircle className="h-5 w-5" />
    </button>
  </div>
</header>

      {/* Desktop */}
<header className="mx-auto mb-8 hidden max-w-[1450px] items-center justify-between px-5 pt-6 sm:px-8 md:flex lg:px-10">
        <div>
          <p className="text-sm font-medium text-slate-400">
            Your secure space
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            My Vault
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onLock}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          >
            <LockKeyhole className="h-4 w-4" />
            Lock Vault
          </button>

          <button
            type="button"
            onClick={() => router.push("/account")}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:bg-slate-50"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#18214d] text-white">
              <UserCircle className="h-5 w-5" />
            </div>

            <span className="text-sm font-semibold text-slate-700">
              My Account
            </span>
          </button>
        </div>
      </header>
    </>
  );
}
