"use client";

import { useEffect, useRef, useState } from "react";

// Phones have no hover, so a bar's tooltip never showed there (Ancung, 13 Nov). On touch screens a tap on
// a bar opens this sheet from the bottom with the same lines as the tooltip, under the service's name.
// It reads the tooltip already rendered inside the bar, so the page stays server-rendered and the two
// never disagree. Closes with the scrim, Close, Esc or a swipe down.
export function BarSheet() {
  const [open, setOpen] = useState<{ service: string; html: string } | null>(null);
  const [shown, setShown] = useState(false);
  const picked = useRef<HTMLElement | null>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const touch = window.matchMedia("(hover: none)");
    const onClick = (e: MouseEvent) => {
      if (!touch.matches) return;
      const bar = e.target instanceof Element ? e.target.closest<HTMLElement>(".bar") : null;
      const tip = bar?.querySelector(".tip");
      if (!bar || !tip) return;
      picked.current?.classList.remove("picked");
      bar.classList.add("picked");
      picked.current = bar;
      setOpen({ service: bar.parentElement?.dataset.service ?? "", html: tip.innerHTML });
      requestAnimationFrame(() => setShown(true));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const close = () => {
    setShown(false);
    picked.current?.classList.remove("picked");
    picked.current = null;
    window.setTimeout(() => setOpen(null), 220);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className={`sheet ${shown ? "shown" : ""}`} role="dialog" aria-modal="true" aria-label={`${open.service}: this half hour`}>
      <div className="sheetscrim" onClick={close} />
      <div
        ref={panel}
        className="sheetpanel"
        onPointerDown={(e) => {
          drag.current = { y: e.clientY, dy: 0 };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !panel.current) return;
          d.dy = Math.max(0, e.clientY - d.y);
          panel.current.style.transform = `translateY(${d.dy}px)`;
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (panel.current) panel.current.style.transform = "";
          if (d && d.dy > 80) close();
        }}
      >
        <span className="sheethandle" aria-hidden="true" />
        <p className="sheettitle">{open.service}</p>
        <div className="sheetbody" dangerouslySetInnerHTML={{ __html: open.html }} />
        <button type="button" className="sheetclose" onClick={close}>
          Close
        </button>
      </div>
    </div>
  );
}
