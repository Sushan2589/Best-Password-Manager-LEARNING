import { useEffect, useState } from "react";
import { websitePermission } from "../../background/inlinePermissions";

export function SiteAccessPrompt({ origin }: { origin: string }) {
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    void chrome.permissions.contains({ origins: [websitePermission(origin)] }).then(allowed => { if (alive) setMissing(!allowed); }).catch(() => {});
    return () => { alive = false; };
  }, [origin]);
  if (!missing) return null;
  return <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3" aria-label="Website access required">
    <p className="text-xs leading-5">Allow Password Manager to show suggestions on {origin}?</p>
    <button className="secondary mt-2" disabled={busy} onClick={() => {
      setBusy(true); setNotice("");
      void chrome.permissions.request({ origins: [websitePermission(origin)] }).then(async granted => {
        if (!granted) { setNotice("Website access was not granted."); return; }
        const reply = await chrome.runtime.sendMessage({ type: "inline/settings", origin, enabled: true });
        if (reply?.ok) setMissing(false); else setNotice("Unable to enable website suggestions.");
      }).catch(() => setNotice("Unable to request website access.")).finally(() => setBusy(false));
    }}>Allow website access</button>
    {notice && <p role="status" className="mt-2 text-xs">{notice}</p>}
  </section>;
}
