"use client";

import { useEffect, useState } from "react";
import { Logo } from "./Logo";

const LINKS = [
  { label: "Minds", href: "#minds" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Safety", href: "#safety" },
  { label: "Skills", href: "#skills" },
];

// The web app (decided 9 Nov, #125). NEXT_PUBLIC_APP_URL overrides it, e.g. for a local app.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.hellonear.xyz";

// Past this many pixels of scroll the bar turns into the pill.
const SCROLL_THRESHOLD = 24;

// Each letter gets its distance from the middle of the word, so on hover the
// growth starts in the middle and spreads to both ends at the same time.
function Letters({ text }: { text: string }) {
  const middle = (text.length - 1) / 2;
  return (
    <span className="nav-letters" aria-hidden="true">
      {[...text].map((ch, i) => (
        <span key={i} className="nav-ch" style={{ "--d": Math.abs(i - middle) } as React.CSSProperties}>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header className="nav" data-scrolled={scrolled}>
      <div className="nav-shell">
        <a href="#top" className="nav-logo" aria-label="HelloNear home">
          <Logo className="h-[30px] w-auto" />
        </a>

        {/* Centred group: when one link grows, the group stays centred, so the
            hovered link keeps its place and its neighbours move aside. */}
        <nav className="nav-links" aria-label="Main">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="nav-link" aria-label={l.label}>
              <Letters text={l.label} />
            </a>
          ))}
        </nav>

        <a href={APP_URL} className="nav-cta">
          Open app
          {/* Lucide arrow-up-right, 15 px, as in design/landing.pen */}
          <svg
            className="nav-cta-arrow"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 7h10v10" />
            <path d="M7 17 17 7" />
          </svg>
        </a>
      </div>
    </header>
  );
}
