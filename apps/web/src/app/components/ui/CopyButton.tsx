"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
export default function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [status, setStatus] = useState("");
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    if (pending.current) return;
    pending.current = true;
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      setStatus("Copy failed. Please try again.");
    } finally {
      pending.current = false;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus(""), 2000);
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => void copy()}
        className="flex h-11 w-11 items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-100"
      >
        {status === "Copied" ? (
          <Check size={16} className="text-emerald-600" />
        ) : (
          <Copy size={16} />
        )}
      </button>
      <span
        role="status"
        className={
          status.startsWith("Copy failed") ? "text-xs text-red-600" : "sr-only"
        }
      >
        {status}
      </span>
    </span>
  );
}
