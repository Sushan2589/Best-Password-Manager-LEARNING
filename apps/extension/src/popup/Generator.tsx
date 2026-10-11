import { useEffect, useRef, useState } from "react";
import { generatePassword, DEFAULT_CHARACTER_OPTIONS, type CharacterOptions } from "@password-manager/shared";
import { Copy, RefreshCw } from "lucide-react";

export function Generator() {
  const [length, setLength] = useState(20);
  const [options, setOptions] = useState<CharacterOptions>({ ...DEFAULT_CHARACTER_OPTIONS });
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const valid = Object.values(options).some(Boolean) && Number.isInteger(length) && length >= 8 && length <= 64;
  function generate() {
    try { setPassword(generatePassword(length, options)); setNotice(""); }
    catch { setPassword(""); setNotice("Choose a length of 8–64 and at least one character type."); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(password); if (alive.current) setNotice("Generated password copied."); }
    catch { if (alive.current) setNotice("Unable to copy. Keep the popup focused and try again."); }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="text-lg font-bold">Password generator</h2>
    <p className="mt-2 text-xs leading-5 text-slate-500">Generated locally. Selected character types are allowed; each type is not guaranteed to appear.</p>
    <label htmlFor="generated-password" className="mt-4 block text-xs font-semibold">Generated password</label>
    <output id="generated-password" className="mt-2 block break-all rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm">{password || "Choose your options and generate."}</output>
    <label htmlFor="generator-length" className="mt-4 block text-xs font-semibold">Password length</label>
    <input id="generator-length" className="auth-input mt-2" type="number" min={8} max={64} value={length} onChange={event => { setLength(Number(event.target.value)); setPassword(""); setNotice(""); }} />
    <fieldset className="mt-4 space-y-2"><legend className="mb-2 text-xs font-semibold">Character types</legend>{(["lowercase", "uppercase", "numbers", "symbols"] as const).map(name => <label key={name} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={options[name]} onChange={event => { setOptions({ ...options, [name]: event.target.checked }); setPassword(""); setNotice(""); }} />{name[0]!.toUpperCase() + name.slice(1)}</label>)}</fieldset>
    <button className="primary mt-4" disabled={!valid} onClick={generate}><RefreshCw size={14} />Generate password</button>
    <button className="secondary mt-2" disabled={!password} onClick={() => void copy()}><Copy size={14} />Copy generated password</button>
    {!valid && <p role="alert" className="mt-2 text-xs text-red-700">Choose 8–64 characters and at least one character type.</p>}
    {notice && <p role="status" className="mt-2 text-xs">{notice}</p>}
    <p className="mt-3 text-[10px] leading-4 text-slate-400">Copied values can remain in your device clipboard after the popup closes.</p>
  </section>;
}
