"use client";

import { useState } from "react";

type AuthInputProps = {
  id: string;
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
};

export default function AuthInput({
  id,
  name,
  label,
  type = "text",
  placeholder,
  required = false,
  autoComplete,
}: AuthInputProps) {
  const isPassword = type === "password";
  const [showPassword, setShowPassword] = useState(false);

  const inputType =
    isPassword && showPassword ? "text" : type;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-semibold text-slate-700"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={inputType}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          className={`w-full rounded-xl border-0 bg-[#f8f8fa] px-4 py-3.5 text-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-[#c45b48]/40 ${
            isPassword ? "pr-20" : ""
          }`}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-[#18214d]"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </div>
  );
}