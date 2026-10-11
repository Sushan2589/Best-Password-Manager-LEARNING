import { matchingOrigin } from "./matching";
import { safeWebsiteUrl } from "../vault/credentials";

export type ActiveSite = { status: "ready"; origin: string } |
  { status: "checking" | "unavailable" | "insecure" };
export type TabSnapshot = { url?: string; status?: string };

export function siteFromTabs(tabs: readonly TabSnapshot[]): ActiveSite {
  if (tabs.length !== 1) return { status: "unavailable" };
  const tab = tabs[0]!;
  // Never retain the previous origin while navigation is pending.
  if (tab.status === "loading") return { status: "checking" };
  const origin = matchingOrigin(tab.url);
  if (origin) return { status: "ready", origin };
  return { status: safeWebsiteUrl(tab.url)?.startsWith("http:") ? "insecure" : "unavailable" };
}

// The popup owns this observer. Out-of-order responses and unmounts cannot
// restore an older origin. Nothing is persisted or sent to the API/worker.
export function observeActiveSite(read: () => Promise<readonly TabSnapshot[]>,
  subscribe: (refresh: () => void) => () => void, publish: (site: ActiveSite) => void) {
  let alive = true;
  let generation = 0;
  const refresh = () => {
    if (!alive) return;
    const current = ++generation;
    publish({ status: "checking" });
    void read().then(tabs => {
      if (alive && current === generation) publish(siteFromTabs(tabs));
    }).catch(() => {
      if (alive && current === generation) publish({ status: "unavailable" });
    });
  };
  const unsubscribe = subscribe(refresh);
  refresh();
  return () => { alive = false; ++generation; unsubscribe(); };
}
