"use client";

import LoadingScreen from "../components/ui/LoadingScreen";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearVaultKey, getVaultOwner } from "@/lib/crypto/vaultKeyStore";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function VaultLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const locked = () => { if (pathname !== "/vault") router.replace("/vault"); };
    window.addEventListener("vault-locked", locked);
    return () => window.removeEventListener("vault-locked", locked);
  }, [pathname, router]);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    async function checkSession() {
      try {
        const response = await fetch(`${API_URL}/user/me`, {
          credentials: "include",
        });

        if (!alive) return;
        if (!response.ok) {
          clearVaultKey();
          router.replace("/login");
          return;
        }
        const profile = await response.json();
        if (!alive) return;
        if (!profile.emailVerified || (getVaultOwner() && getVaultOwner() !== profile.id) || Date.parse(profile.sessionExpiresAt) <= Date.now()) {
          clearVaultKey(); router.replace("/login"); return;
        }
        if (alive) setChecking(false);
      } catch {
        if (!alive) return;
        clearVaultKey();
        console.error("Session check failed.");
        router.replace("/login");
      }
    }

    checkSession();
    const timer = setInterval(checkSession, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [router]);

  if (checking) {
    return (
      <LoadingScreen message="Checking your session..." />
    );
  }

  return <>{children}</>;
}
