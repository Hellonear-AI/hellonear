"use client";

import { useEffect, useRef } from "react";

// Expand all / Collapse all for the FAQ's <details>, and open the one a #link points at. The answers are plain
// <details>, so they work without JavaScript.
export function FaqControls({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const setAll = (open: boolean) => ref.current?.querySelectorAll("details").forEach((d) => (d.open = open));
  useEffect(() => {
    const openHash = () => {
      const el = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    };
    openHash();
    window.addEventListener("hashchange", openHash);
    return () => window.removeEventListener("hashchange", openHash);
  }, []);
  return (
    <div ref={ref}>
      <div className="faq-controls">
        <button type="button" onClick={() => setAll(true)}>Expand all</button>
        <button type="button" onClick={() => setAll(false)}>Collapse all</button>
      </div>
      {children}
    </div>
  );
}
