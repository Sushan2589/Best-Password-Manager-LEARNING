"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Dices,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?";

type CharacterOptions = {
  lowercase: boolean;
  uppercase: boolean;
  numbers: boolean;
  symbols: boolean;
};

type PasswordGeneratorProps = {
  mode?: "standalone" | "embedded";
  onUsePassword?: (password: string) => void;
};

function generatePassword(
  length: number,
  options: CharacterOptions,
) {
  let characters = "";

  if (options.lowercase) characters += LOWERCASE;
  if (options.uppercase) characters += UPPERCASE;
  if (options.numbers) characters += NUMBERS;
  if (options.symbols) characters += SYMBOLS;

  if (!characters) {
    return "";
  }

  const randomValues = new Uint32Array(length);

  crypto.getRandomValues(randomValues);

  const maxUint32 = 0xffffffff;
  const limit =
    maxUint32 - (maxUint32 % characters.length);

  let password = "";

  for (const value of randomValues) {
    if (value >= limit) {
      continue;
    }

    password += characters[value % characters.length];

    if (password.length === length) {
      break;
    }
  }

  while (password.length < length) {
    const extra = new Uint32Array(1);

    crypto.getRandomValues(extra);

    const value = extra[0];

    if (value >= limit) {
      continue;
    }

    password += characters[value % characters.length];
  }

  return password;
}

function calculateStrength(
  password: string,
  options: CharacterOptions,
) {
  if (!password) {
    return {
      label: "None",
      score: 0,
    };
  }

  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 20) score++;

  if (options.lowercase) score++;
  if (options.uppercase) score++;
  if (options.numbers) score++;
  if (options.symbols) score++;

  if (score <= 2) {
    return {
      label: "Weak",
      score: 1,
    };
  }

  if (score <= 4) {
    return {
      label: "Good",
      score: 2,
    };
  }

  if (score <= 6) {
    return {
      label: "Strong",
      score: 3,
    };
  }

  return {
    label: "Very strong",
    score: 4,
  };
}

export default function PasswordGenerator({
  mode = "standalone",
  onUsePassword,
}: PasswordGeneratorProps) {
  const [length, setLength] = useState(20);

  const [options, setOptions] = useState<CharacterOptions>({
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: true,
  });

  const [password, setPassword] = useState(() =>
    generatePassword(20, {
      lowercase: true,
      uppercase: true,
      numbers: true,
      symbols: true,
    }),
  );

  const [copied, setCopied] = useState(false);

  const strength = useMemo(
    () => calculateStrength(password, options),
    [password, options],
  );

  function createPassword() {
    const generated = generatePassword(length, options);

    setPassword(generated);
    setCopied(false);
  }

  async function handleCopy() {
    if (!password) return;

    try {
      await navigator.clipboard.writeText(password);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (error) {
      console.error("Failed to copy password:", error);
    }
  }

  function toggleOption(option: keyof CharacterOptions) {
    const enabledCount = Object.values(options).filter(Boolean).length;

    if (options[option] && enabledCount === 1) {
      return;
    }

    setOptions((current) => ({
      ...current,
      [option]: !current[option],
    }));
  }

  const strengthWidth = `${strength.score * 25}%`;

  return (
    <section
      className={
        mode === "embedded"
          ? "p-5 sm:p-7"
          : "rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100 sm:p-8"
      }
    >
      {/* Password preview */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-700">
            Generated password
          </label>

          <span className="text-xs text-slate-400">
            Created locally
          </span>
        </div>

        <div className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2">
          <div className="min-w-0 flex-1 overflow-x-auto px-3 py-2">
            <p className="whitespace-nowrap font-mono text-sm font-semibold tracking-wide text-[#18214d]">
              {password || "Unable to generate password"}
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!password}
            aria-label="Copy password"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-[#18214d] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Strength */}
      <div className="mt-6 rounded-2xl bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />

            <span className="text-sm font-semibold text-slate-700">
              Password strength
            </span>
          </div>

          <span className="text-xs font-semibold text-slate-500">
            {strength.label}
          </span>
        </div>

        <div className="mt-3 flex gap-1.5">
          {[1, 2, 3, 4].map((segment) => (
            <div
              key={segment}
              className={`h-1.5 flex-1 rounded-full transition ${
                segment <= strength.score
                  ? "bg-[#18214d]"
                  : "bg-slate-200"
              }`}
            />
          ))}
        </div>

        <div
          className="mt-2 h-0 overflow-hidden"
          aria-hidden="true"
        >
          <div style={{ width: strengthWidth }} />
        </div>
      </div>

      {/* Length */}
      <div className="mt-7">
        <div className="flex items-center justify-between">
          <label
            htmlFor="password-length"
            className="text-sm font-semibold text-slate-700"
          >
            Password length
          </label>

          <span className="rounded-lg bg-[#eef0f8] px-3 py-1 text-sm font-bold text-[#18214d]">
            {length}
          </span>
        </div>

        <input
          id="password-length"
          type="range"
          min={8}
          max={64}
          value={length}
          onChange={(event) => {
            setLength(Number(event.target.value));
          }}
          className="mt-4 w-full accent-[#18214d]"
        />

        <div className="mt-1 flex justify-between text-xs text-slate-400">
          <span>8</span>
          <span>64</span>
        </div>
      </div>

      {/* Character options */}
      <div className="mt-7">
        <p className="text-sm font-semibold text-slate-700">
          Character types
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            {
              key: "lowercase" as const,
              label: "Lowercase",
              example: "a-z",
            },
            {
              key: "uppercase" as const,
              label: "Uppercase",
              example: "A-Z",
            },
            {
              key: "numbers" as const,
              label: "Numbers",
              example: "0-9",
            },
            {
              key: "symbols" as const,
              label: "Symbols",
              example: "!@#$",
            },
          ].map((option) => {
            const enabled = options[option.key];

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => toggleOption(option.key)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3.5 text-left transition ${
                  enabled
                    ? "border-[#18214d]/20 bg-[#f8f8fb]"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {option.label}
                  </p>

                  <p className="mt-0.5 text-xs text-slate-400">
                    {option.example}
                  </p>
                </div>

                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${
                    enabled
                      ? "border-[#18214d] bg-[#18214d] text-white"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {enabled && <Check className="h-3 w-3" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Generate */}
      <button
        type="button"
        onClick={createPassword}
        className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#18214d] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#10183c]"
      >
        <RefreshCw className="h-4 w-4" />
        Generate new password
      </button>

      {/* Use generated password */}
      {mode === "embedded" && (
        <button
          type="button"
          onClick={() => onUsePassword?.(password)}
          disabled={!password}
          className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-[#c45b48] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#b84f3e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Use this password
        </button>
      )}

      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
        <Dices className="h-3.5 w-3.5" />

        <span>
          Passwords are generated securely in your browser.
        </span>
      </div>
    </section>
  );
}