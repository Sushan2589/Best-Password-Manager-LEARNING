"use client";

import LoadingScreen from "../components/ui/LoadingScreen";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function VaultLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch(`${API_URL}/user/me`, {
          credentials: "include",
        });

        if (!response.ok) {
          router.replace("/login");
          return;
        }

        setChecking(false);
      } catch (error) {
        console.error(error);
        router.replace("/login");
      }
    }

    checkSession();
  }, [router]);

  if (checking) {
    return (
      <LoadingScreen message="Checking your session..." />
    );
  }

  return <>{children}</>;
}