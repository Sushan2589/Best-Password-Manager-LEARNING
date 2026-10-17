"use client";

import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordInput({ label, id, className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const form = input.current?.form;
    const hide = () => setVisible(false);
    form?.addEventListener("reset", hide);
    window.addEventListener("blur", hide);
    return () => { form?.removeEventListener("reset", hide); window.removeEventListener("blur", hide); };
  }, []);
  return <span className="relative block">
    <input {...props} ref={input} id={inputId} type={visible ? "text" : "password"} className={`${className} pr-14`} />
    <button type="button" aria-label={`${visible ? "Hide" : "Show"} ${label}`} aria-controls={inputId} aria-pressed={visible}
      disabled={props.disabled} onClick={() => setVisible(value => !value)}
      className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#c45b48] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c45b48] disabled:cursor-not-allowed disabled:opacity-50">
      {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
    </button>
  </span>;
}
