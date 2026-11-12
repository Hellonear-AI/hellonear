"use client";

import { useEffect, useRef, useState } from "react";

// The page's own scrollbar, floating over the page (Ancung, 12 Nov: the browser's bar on Windows sat
// in a light strip of its own beside the sky; a native bar can't be see-through, since its gutter
// always shows the page's background). The native one is hidden in globals.css; this thin thumb
// shows while scrolling or when the pointer is near the edge, fades out after, and can be dragged.
// A dark thumb with a light edge, so it reads on the sky and on the night sections alike.
const MIN_THUMB = 40;
const HIDE_AFTER_MS = 900;

export function OverlayScrollbar() {
  const thumb = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [dragging, setDragging] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const drag = useRef<{ startY: number; startScroll: number } | null>(null);

  useEffect(() => {
    let raf = 0;
    const place = () => {
      raf = 0;
      const el = thumb.current;
      if (!el) return;
      const doc = document.documentElement;
      const view = window.innerHeight;
      const total = doc.scrollHeight;
      if (total <= view + 1) {
        el.style.display = "none";
        return;
      }
      el.style.display = "";
      const h = Math.max(MIN_THUMB, (view / total) * view);
      const top = (window.scrollY / (total - view)) * (view - h);
      el.style.height = `${h}px`;
      el.style.transform = `translateY(${top}px)`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    const onScroll = () => {
      schedule();
      setShown(true);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setShown(false), HIDE_AFTER_MS);
    };
    place();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);
    // The page grows as sections and images load.
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startScroll: window.scrollY };
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = thumb.current;
    if (!d || !el) return;
    const view = window.innerHeight;
    const total = document.documentElement.scrollHeight;
    const travel = view - el.offsetHeight;
    if (travel <= 0) return;
    // Thumb pixels to page pixels, at once: through Lenis when it runs (SmoothScroll), else "instant".
    const top = d.startScroll + ((e.clientY - d.startY) / travel) * (total - view);
    const lenis = (window as unknown as { __lenis?: { scrollTo: (y: number, o: { immediate: boolean }) => void } }).__lenis;
    if (lenis) lenis.scrollTo(top, { immediate: true });
    else window.scrollTo({ top, behavior: "instant" });
  };
  const onUp = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div aria-hidden="true" className="overlay-scrollbar group fixed top-0 right-0 z-[60] h-full w-3 pointer-coarse:pointer-events-none">
      <div
        ref={thumb}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={`absolute top-0 right-[3px] w-[6px] rounded-full bg-black/35 shadow-[0_0_0_1px_rgba(255,255,255,0.35)] transition-[opacity,width] duration-300 group-hover:w-[8px] group-hover:opacity-100 ${shown || dragging ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
