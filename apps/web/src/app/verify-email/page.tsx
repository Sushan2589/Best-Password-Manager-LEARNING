"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, CircleX, MailCheck, MailWarning } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function VerifyEmail() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get("token");

  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;

    const verifyEmail = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/verify-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (!response.ok) {
          setStatus("error");
          setMessage(data.message || "Email verification failed.");
          return;
        }

        setStatus("success");
        setMessage(data.message || "Email verified successfully.");

        setTimeout(() => {
          router.push("/vault");
        }, 1500);
      } catch (error) {
        console.error("Email verification failed:", error);
        setStatus("error");
        setMessage("Unable to connect to the server.");
      }
    };

    verifyEmail();
  }, [token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#faf9f7] px-6">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <div
              className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full text-2xl ${
                !token || status === "error"
                  ? "bg-red-50"
                  : status === "success"
                    ? "bg-green-50"
                    : "bg-amber-50"
              }`}
            >
              {!token || status === "error" ? (
                <MailWarning className="h-7 w-7" />
              ) : status === "success" ? (
                <CheckCircle2 className="h-7 w-7" />
              ) : (
                <MailCheck className="h-7 w-7" />
              )}
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              {!token
                ? "Verification link missing"
                : status === "success"
                  ? "Email verified"
                  : status === "error"
                    ? "Verification failed"
                    : "Verify your email"}
            </h1>
          </div>

          <div className="text-center">
            {!token ? (
              <>
                <p className="text-sm leading-6 text-gray-500">
                  This verification link is missing a token. Please use the link
                  from your verification email.
                </p>

                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="mt-6 w-full rounded-xl bg-[#c45b48] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b84f3e]"
                >
                  Back to sign in
                </button>
              </>
            ) : status === "verifying" ? (
              <p className="text-sm leading-6 text-gray-500">
                Verifying your email. Please wait...
              </p>
            ) : status === "success" ? (
              <p className="text-sm leading-6 text-gray-500">
                {message}
                <br />
                Redirecting you to your vault...
              </p>
            ) : (
              <>
                <p className="text-sm leading-6 text-gray-500">{message}</p>

                <p className="mt-3 text-sm leading-6 text-gray-500">
                  The verification link may have expired. Sign in to request a
                  new verification email.
                </p>

                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="mt-6 w-full rounded-xl bg-[#c45b48] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b84f3e]"
                >
                  Back to sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
