"use client";

import { useState } from "react";
import { websiteIconUrl } from "@/lib/websiteIcons";

function RemoteIcon({ src, fallback }: { src: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span>{fallback}</span> : <img src={src} alt="" width={32} height={32} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-3/4 w-3/4 rounded object-contain" onError={() => setFailed(true)} />;
}

export default function WebsiteIcon({ website, title, size = 44 }: { website?: string; title: string; size?: number }) {
  const src = websiteIconUrl(website);
  const initial = [...title.trim()][0]?.toUpperCase() || "?";
  return <span aria-hidden="true" className="flex shrink-0 items-center justify-center rounded-xl bg-[#eef0f8] text-sm font-bold text-[#20285e]" style={{ width: size, height: size }}>
    {src ? <RemoteIcon key={src} src={src} fallback={initial} /> : <span>{initial}</span>}
  </span>;
}
