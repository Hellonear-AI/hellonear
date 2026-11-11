"use client";

import { useEffect, useRef, useState } from "react";

// The page loader: the HelloNear Mind building itself (the head's bubbles pop in one by one, the
// sprout grows, the eyes open and blink, then it breathes) with a lime progress line, on the page
// colour. It is in the server HTML, so a visitor never sees an empty page.
//
// 1. First visit: it stays until the page has loaded (images on the first screen and, on desktop, the
//    3D Mind), at least long enough for the logo to build, then lifts and tells the hero to start
//    (`hn:reveal`, so the Mind's entrance plays in view). At most 8 s, whatever happens.
// 2. In-page links (the nav, footer, hero buttons): instead of scrolling through every section and
//    its animations, it covers the page for a moment, jumps straight to the target, and lifts again.
// Reduced motion: no building or breathing, just a short fade.

// The Mind mark from the logo (Logo.tsx), drawn as separate circles so each one can pop in.
const BUBBLES: [number, number, number][] = [
  [56, 174, 28], [200, 174, 28], [84, 146, 38], [172, 146, 38], [128, 128, 46], [96, 182, 34], [160, 182, 34], [128, 186, 36],
];

function Mark() {
  return (
    <svg viewBox="18 34 220 196" className="ld-mark h-auto w-[132px]" aria-hidden="true">
      <path className="ld-sprout" fill="var(--color-accent)" d="M122 92V62H134V92ZM128 64A24.6 24.6 0 0 1 96.9 42.2A24.6 24.6 0 0 1 128 64ZM159.1 42.2A24.6 24.6 0 0 1 128 64A24.6 24.6 0 0 1 159.1 42.2Z" />
      {BUBBLES.map(([cx, cy, r], i) => (
        <circle key={i} className="ld-bubble" cx={cx} cy={cy} r={r} fill="var(--color-text)" style={{ animationDelay: `${i * 55}ms` }} />
      ))}
      <g className="ld-eyes">
        <path fill="#fff" d="M114.3 142A20 20 0 1 1 77.7 142ZM178.3 142A20 20 0 1 1 141.7 142Z" />
        <path fill="var(--color-text)" d="M109.9 142A10.4 10.4 0 1 1 94.9 142ZM173.9 142A10.4 10.4 0 1 1 158.9 142Z" />
      </g>
    </svg>
  );
}

const DESKTOP = "(min-width: 1024px)";

/** Where an in-page link should land. On desktop the approvals section is one long pinned scroll, so
    "Safety" (the Tricked cards) and "Skills" (the Mind Graph title) are points inside it. */
function targetY(hash: string): number | null {
  if (hash === "#top" || hash === "#") return 0;
  const desktop = window.matchMedia(DESKTOP).matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hiw = document.getElementById("how-it-works");
  const hiwTop = hiw ? hiw.getBoundingClientRect().top + window.scrollY : 0;
  if (desktop && hiw && hash === "#safety") return hiwTop + 1700;
  if (desktop && hiw && hash === "#skills") return hiwTop + 3150;
  const id = !desktop && hash === "#safety" ? "safety-mobile" : hash.slice(1);
  const el = document.getElementById(id);
  return el ? el.getBoundingClientRect().top + window.scrollY : null;
}

export function PageLoader() {
  const [phase, setPhase] = useState<"loading" | "out" | "gone" | "cover">("loading");
  const [run, setRun] = useState(0); // re-mounts the mark so it builds again on every cover
  const bar = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  // 1. First visit
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const html = document.documentElement;
    html.style.overflow = "hidden";
    let progress = 0.08;
    let raf = 0;
    const creep = () => {
      progress += (0.9 - progress) * 0.015; // eases towards 90% while it waits
      if (bar.current) bar.current.style.transform = `scaleX(${progress})`;
      raf = requestAnimationFrame(creep);
    };
    raf = requestAnimationFrame(creep);

    const minTime = new Promise((r) => setTimeout(r, reduced ? 200 : 1300));
    const pageLoaded = new Promise<void>((r) => (document.readyState === "complete" ? r() : window.addEventListener("load", () => r(), { once: true })));
    const mind = window.matchMedia(DESKTOP).matches
      ? new Promise<void>((r) => window.addEventListener("hn:mind-loaded", () => r(), { once: true }))
      : Promise.resolve();
    const cap = new Promise((r) => setTimeout(r, 8000));
    let done = false;
    Promise.race([Promise.all([minTime, pageLoaded, mind]), cap]).then(() => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      if (bar.current) bar.current.style.transform = "scaleX(1)";
      setTimeout(() => {
        setPhase("out");
        html.style.overflow = "";
        (window as unknown as { __hnRevealed?: boolean }).__hnRevealed = true;
        window.dispatchEvent(new Event("hn:reveal"));
        setTimeout(() => setPhase("gone"), 650);
      }, reduced ? 0 : 220);
    });
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      html.style.overflow = "";
    };
  }, []);

  // 2. In-page links: cover, jump, uncover
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a[href^='#']") as HTMLAnchorElement | null;
      if (!a) return;
      const hash = a.getAttribute("href") || "#";
      if (targetY(hash) == null) return;
      e.preventDefault();
      if (busy.current) return;
      busy.current = true;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setRun((n) => n + 1);
      setPhase("cover");
      setTimeout(() => {
        const y = targetY(hash) ?? 0;
        window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
        history.replaceState(null, "", hash === "#top" ? location.pathname : hash);
        // let the scroll-driven scenes settle and the images there decode, then lift
        setTimeout(() => {
          setPhase("out");
          setTimeout(() => {
            setPhase("gone");
            busy.current = false;
          }, 600);
        }, reduced ? 50 : 650);
      }, reduced ? 50 : 320);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (phase === "gone") return null;
  return (
    <div
      className={`page-loader ${phase === "out" ? "is-out" : ""} ${phase === "cover" ? "is-cover" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy={phase !== "out"}
    >
      <span className="sr-only">Loading HelloNear</span>
      <div className="ld-stack" key={run}>
        <Mark />
        <div className="ld-track" aria-hidden="true">
          <div ref={phase === "loading" ? bar : undefined} className={`ld-bar ${phase === "cover" ? "is-sweep" : ""}`} />
        </div>
      </div>
    </div>
  );
}
