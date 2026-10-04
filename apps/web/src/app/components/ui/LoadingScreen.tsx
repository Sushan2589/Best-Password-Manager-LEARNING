"use client";

type LoadingScreenProps = {
  message?: string;
};

export default function LoadingScreen({
  message = "Loading...",
}: LoadingScreenProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f4f7] px-4 text-[#18214d]">
      <div className="w-full max-w-sm rounded-[28px] bg-white p-8 text-center shadow-[0_20px_60px_rgba(32,35,70,0.08)] ring-1 ring-slate-100">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#18214d] text-2xl text-white shadow-sm">
          🔐
        </div>

        <h1 className="mt-5 text-lg font-bold">
          Password Manager
        </h1>

        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#c45b48]" />

          <p className="text-sm text-slate-500">
            {message}
          </p>
        </div>
      </div>
    </main>
  );
}