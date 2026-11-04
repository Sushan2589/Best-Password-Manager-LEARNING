"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
export default function NavigationProgress() {
  const bar = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pathname = usePathname();
  useEffect(() => {
    clearTimeout(timer.current);
    clearTimeout(expiry.current);
    bar.current?.classList.remove("navigation-pending");
  }, [pathname]);
  useEffect(() => {
    const start = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest?.("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target ||
        anchor.download
      )
        return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || url.pathname === location.pathname)
        return;
      clearTimeout(timer.current);
      clearTimeout(expiry.current);
      expiry.current = setTimeout(
        () => bar.current?.classList.remove("navigation-pending"),
        30000,
      );
      timer.current = setTimeout(
        () => bar.current?.classList.add("navigation-pending"),
        180,
      );
    };
    const stop = () => {
      clearTimeout(expiry.current);
      clearTimeout(timer.current);
      bar.current?.classList.remove("navigation-pending");
    };
    document.addEventListener("click", start);
    window.addEventListener("pagehide", stop);
    return () => {
      stop();
      document.removeEventListener("click", start);
      window.removeEventListener("pagehide", stop);
    };
  }, []);
  return <div ref={bar} aria-hidden="true" className="navigation-progress" />;
}
