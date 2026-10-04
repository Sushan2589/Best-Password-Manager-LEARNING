"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  footerText: string;
  footerLinkText: string;
  footerLinkHref: string;
};

export default function AuthShell({
  title,
  description,
  children,
  footerText,
  footerLinkText,
  footerLinkHref,
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-[#f6f4f7] px-4 py-8 text-[#18214d] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center justify-center">
        <div className="w-full">
          {/* Brand */}
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#18214d] text-2xl text-white shadow-sm">
              🔐
            </div>

            <p className="mt-4 text-sm font-bold">
              Password Manager
            </p>
          </div>

          {/* Card */}
          <div className="rounded-[28px] bg-white p-6 shadow-[0_20px_60px_rgba(32,35,70,0.08)] ring-1 ring-slate-100 sm:p-8">
            <div className="mb-7">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {title}
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                {description}
              </p>
            </div>

            {children}
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-sm text-slate-500">
            {footerText}{" "}
            <Link
              href={footerLinkHref}
              className="font-semibold text-[#c45b48] hover:underline"
            >
              {footerLinkText}
            </Link>
          </p>

          {/* Security note */}
          <div className="mt-6 flex gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4">
            <span className="text-sm">🔒</span>

            <div>
              <p className="text-xs font-semibold text-slate-600">
                Your data stays protected
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                Your vault is encrypted before sensitive credentials
                are sent to the server.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}