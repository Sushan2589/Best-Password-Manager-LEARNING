import { useState } from "react";
import { websiteIconUrl } from "@password-manager/shared/website-icons";

function RemoteIcon({ src, initial }: { src: string; initial: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span>{initial}</span> : <img src={src} alt="" width={24} height={24} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-6 rounded object-contain" onError={() => setFailed(true)} />;
}

export function WebsiteIcon({ website, title }: { website?: string; title: string }) {
  const src = websiteIconUrl(website);
  const initial = [...title.trim()][0]?.toUpperCase() || "?";
  return <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#a34536]/8 text-sm font-semibold text-[#a34536]">
    {src ? <RemoteIcon key={src} src={src} initial={initial} /> : <span>{initial}</span>}
  </span>;
}
