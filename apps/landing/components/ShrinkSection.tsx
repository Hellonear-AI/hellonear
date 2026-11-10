"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// A full-width section whose sides draw in as it scrolls away: by the time its bottom is a little
// above the middle of the screen it is a rounded card about 10% wider than the 1200 px content frame
// (the Minds cards). Scrolling back up widens it again (scrubbed). Only clip-path changes. Desktop
// only; reduced motion: stays full width.

const CARD_W = 1276; // the 1160 px content width (1200 minus padding) + 10%
const RADIUS = 36;

export function ShrinkSection({ children, ...props }: React.ComponentProps<"section">) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
      const st = { p: 0 };
      const render = () => {
        const side = Math.max(0, (window.innerWidth - CARD_W) / 2) * st.p;
        el.style.clipPath = `inset(0px ${side}px 0px ${side}px round ${RADIUS * st.p}px)`;
      };
      gsap.to(st, {
        p: 1,
        ease: "none",
        onUpdate: render,
        scrollTrigger: { trigger: el, start: "bottom bottom", end: "bottom 45%", scrub: 0.6, onRefresh: render },
      });
      return () => {
        el.style.clipPath = "";
      };
    });
    return () => mm.revert();
  }, []);
  return (
    <section ref={ref} {...props}>
      {children}
    </section>
  );
}
