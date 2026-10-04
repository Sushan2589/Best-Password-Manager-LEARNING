"use client";

import { useRouter } from "next/navigation";
import {
  Home,
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

export default function Sidebar({
  onLock,
  onLogout,
}: SidebarProps) {
  const router = useRouter();

  return (
    <aside className="hidden w-[250px] shrink-0 border-r border-slate-200 bg-white px-5 py-6 md:flex md:flex-col">
      <div className="mb-10 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#18214d] text-white">
          🔐
        </div>

        <div>
          <p className="font-bold leading-tight">Password</p>
          <p className="text-xs text-slate-400">Manager</p>
        </div>
      </div>

      <nav className="space-y-1">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl bg-[#18214d] px-4 py-3 text-left text-sm font-medium text-white"
        >
          <Home className="h-4 w-4" />
          Dashboard
        </button>

        <button
          type="button"
          onClick={() => router.push("/vault")}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-100"
        >
          <Vault className="h-4 w-4" />
          My Vault
        </button>

        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-100"
        >
          <Star className="h-4 w-4" />
          Favorites
        </button>

        <button
          type="button"
          onClick={() => router.push("/account")}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-100"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </nav>

      <div className="mt-auto space-y-2">
        <button
          type="button"
          onClick={onLock}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-100"
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