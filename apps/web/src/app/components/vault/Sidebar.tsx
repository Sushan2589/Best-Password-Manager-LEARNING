"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Settings,
  Star,
  Vault,
} from "lucide-react";

type SidebarProps = {
  onLock: () => void;
  onLogout: () => void;
};

export default function Sidebar({ onLock, onLogout }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isDashboard =
  pathname === "/vault" && !searchParams.get("filter");

const isVault =
  pathname === "/vault" &&
  searchParams.get("filter") === "all";


  const isAccount = pathname.startsWith("/account");
  const isGenerator = pathname.startsWith("/generator");

  return (
    <aside className="hidden w-[250px] shrink-0 border-r border-slate-200 bg-white px-5 py-6 md:flex md:flex-col">
      {/* Brand */}
      <div className="mb-10 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#18214d] text-white">
          <Lock className="h-5 w-5" />
        </div>

        <div>
          <p className="font-bold leading-tight">Password</p>
          <p className="text-xs text-slate-400">Manager</p>
        </div>
      </div>

      {/* Main navigation */}
      <nav className="space-y-1">
        <button
          type="button"
          onClick={() => router.push("/vault")}
          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
            isDashboard
              ? "bg-[#18214d] text-white"
              : "text-slate-500 hover:bg-slate-100 hover:text-[#18214d]"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </button>

        {/* <button
          type="button"
          onClick={() => router.push("/vault")}
          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
            isVault
              ? "bg-[#18214d] text-white"
              : "text-slate-500 hover:bg-slate-100 hover:text-[#18214d]"
          }`}
        >
          <Vault className="h-4 w-4" />
          My Vault
        </button> */}

        <button
          type="button"
          disabled
          title="Favorites will be available soon"
          className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-300"
        >
          <Star className="h-4 w-4" />
          Favorites
          <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-slate-300">
            Soon
          </span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/generator")}
          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
            isGenerator
              ? "bg-[#18214d] text-white"
              : "text-slate-500 hover:bg-slate-100 hover:text-[#18214d]"
          }`}
        >
          <KeyRound className="h-4 w-4" />
          Password Generator
        </button>
      </nav>

      {/* Account */}
      <div className="mt-8 border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={() => router.push("/account")}
          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
            isAccount
              ? "bg-[#18214d] text-white"
              : "text-slate-500 hover:bg-slate-100 hover:text-[#18214d]"
          }`}
        >
          <Settings className="h-4 w-4" />
          Account
        </button>
      </div>

      {/* Bottom actions */}
      <div className="mt-auto space-y-2 border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={onLock}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-[#18214d]"
        >
          <Lock className="h-4 w-4" />
          Lock Vault
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-red-500 transition hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
