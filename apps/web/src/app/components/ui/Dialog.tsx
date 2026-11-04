"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export default function Dialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      aria-busy={busy}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-xl backdrop:bg-black/40"
    >
      <header className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
          className="rounded-lg p-2 hover:bg-slate-100"
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
