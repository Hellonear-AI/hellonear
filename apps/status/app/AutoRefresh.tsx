"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The backend probes every 5 minutes and caches /v1/status for 30 s, so a refresh a minute is plenty. Only while
// the tab is visible, so a background tab doesn't keep asking.
export function AutoRefresh({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, everyMs]);
  return null;
}
