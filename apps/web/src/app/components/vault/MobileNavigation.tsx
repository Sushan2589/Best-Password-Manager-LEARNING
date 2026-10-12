"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, LayoutDashboard, UserCircle } from "lucide-react";

const items = [
  { href: "/vault", label: "Vault", icon: LayoutDashboard },
  { href: "/generator", label: "Generator", icon: KeyRound },
  { href: "/account", label: "Account", icon: UserCircle },
];

export default function MobileNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Mobile navigation" className="grid grid-cols-3 gap-1 border-b border-slate-200 bg-white px-3 py-2 md:hidden">
    {items.map(({ href, label, icon: Icon }) => {
      const active = pathname === href || pathname.startsWith(`${href}/`);
      return <Link key={href} href={href} prefetch={false} aria-current={active ? "page" : undefined}
        className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors ${active ? "bg-[#c45b48]/10 text-[#a34736]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{label}
      </Link>;
    })}
  </nav>;
}
