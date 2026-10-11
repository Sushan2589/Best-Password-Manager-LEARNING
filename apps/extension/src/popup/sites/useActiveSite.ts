import { useEffect, useState } from "react";
import { observeActiveSite, type ActiveSite } from "./activeSite";

export function useActiveSite(): ActiveSite {
  const [site, setSite] = useState<ActiveSite>({ status: "checking" });
  useEffect(() => observeActiveSite(
    () => chrome.tabs.query({ active: true, currentWindow: true }),
    refresh => {
      const updated = (_id: number, change: { status?: string; url?: string }) => {
        if (change.status || change.url) refresh();
      };
      chrome.tabs.onUpdated.addListener(updated);
      chrome.tabs.onActivated.addListener(refresh);
      chrome.tabs.onRemoved.addListener(refresh);
      window.addEventListener("focus", refresh);
      return () => {
        chrome.tabs.onUpdated.removeListener(updated);
        chrome.tabs.onActivated.removeListener(refresh);
        chrome.tabs.onRemoved.removeListener(refresh);
        window.removeEventListener("focus", refresh);
      };
    }, setSite), []);
  return site;
}
