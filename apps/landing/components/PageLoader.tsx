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

// The Mind mark from the logo (Logo.tsx), rebuilt from HTML pieces (round divs for the head's bubbles,
// small SVGs for the sprout and the eyes) so every animation is transform/opacity on its own layer:
// the compositor runs them, and they stay smooth while the page is busy loading three.js and images.
const BUBBLES: [number, number, number][] = [
  [56, 174, 28], [200, 174, 28], [84, 146, 38], [172, 146, 38], [128, 128, 46], [96, 182, 34], [160, 182, 34], [128, 186, 36],
];
const S = 0.6; // 220 x 196 logo units -> 132 x 118 px
const at = (x: number, y: number, w: number, h: number): React.CSSProperties => ({
  left: (x - 18) * S,
  top: (y - 34) * S,
  width: w * S,
  height: h * S,
});

function Mark() {
  return (
    <div className="ld-mark relative" style={{ width: 220 * S, height: 196 * S }} aria-hidden="true">
      <svg className="ld-sprout absolute" style={at(96.9, 42.2, 62.2, 49.8)} viewBox="96.9 42.2 62.2 49.8">
        <path fill="var(--color-accent)" d="M122 92V62H134V92ZM128 64A24.6 24.6 0 0 1 96.9 42.2A24.6 24.6 0 0 1 128 64ZM159.1 42.2A24.6 24.6 0 0 1 128 64A24.6 24.6 0 0 1 159.1 42.2Z" />
      </svg>
      {BUBBLES.map(([cx, cy, r], i) => (
        <span key={i} className="ld-bubble absolute rounded-full bg-[var(--color-text)]" style={{ ...at(cx - r, cy - r, r * 2, r * 2), animationDelay: `${i * 55}ms` }} />
      ))}
      <svg className="ld-eyes absolute" style={at(77.7, 142, 100.6, 20)} viewBox="77.7 142 100.6 20">
        <path fill="#fff" d="M114.3 142A20 20 0 1 1 77.7 142ZM178.3 142A20 20 0 1 1 141.7 142Z" />
        <path fill="var(--color-text)" d="M109.9 142A10.4 10.4 0 1 1 94.9 142ZM173.9 142A10.4 10.4 0 1 1 158.9 142Z" />
      </svg>
    </div>
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
  const [phase, setPhase] = useState<"loading" | "out" | "gone" | "pre" | "cover">("loading");
  const [run, setRun] = useState(0); // re-mounts the mark so it builds again on every cover
  const bar = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  // 1. First visit
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const html = document.documentElement;
    html.style.overflow = "hidden";
    // the progress line creeps towards 90% in CSS (.ld-bar), and fills when the page is ready

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
      bar.current?.classList.add("is-full");
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
      // fade in with a transition (from "pre", transparent, to "cover"), so the fade out afterwards is a
      // transition too, the same as when the page first lifts
      setPhase("pre");
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase("cover")));
      setTimeout(() => {
        const y = targetY(hash) ?? 0;
        window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
        // No "#…" in the address (Ancung, 13 Nov): the link still works, the bar stays hellonear.xyz.
        history.replaceState(null, "", location.pathname + location.search);
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
      className={`page-loader ${phase === "out" ? "is-out" : ""} ${phase === "pre" ? "is-pre" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy={phase !== "out"}
    >
      <span className="sr-only">Loading HelloNear</span>
      <div className="ld-stack" key={run}>
        <Mark />
        <div className="ld-track" aria-hidden="true">
          <div ref={phase === "loading" ? bar : undefined} className={`ld-bar ${phase === "cover" || phase === "pre" ? "is-sweep" : "is-creep"}`} />
        </div>
      </div>
    </div>
  );
}
