"use client";
import MobileNavigation from "../components/vault/MobileNavigation";

import { ArrowLeft, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import PasswordGenerator from "../components/password-generator/PasswordGenerator";

export default function GeneratorPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-[#292c30]">
      <MobileNavigation />
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-10">
        <button
          onClick={() => router.push("/vault")}
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition enabled:hover:text-[#292c30]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Vault
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#292c30] text-white">
              <KeyRound className="h-5 w-5" />
            </div>

            <div>
              <p className="text-sm font-medium text-[#a34536]">
                Security Tool
              </p>

              <h1 className="mt-0.5 text-2xl font-medium tracking-tight sm:text-3xl">
                Password Generator
              </h1>
            </div>
          </div>

          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Create strong, unique passwords for your accounts. Generated
            passwords are created locally in your browser.
          </p>
        </div>

        <PasswordGenerator />
      </div>
    </main>
  );
}