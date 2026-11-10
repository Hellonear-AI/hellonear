"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// A full-width section whose sides draw in as it scrolls away, until it is a rounded card as wide as
// the content frame the Minds cards sit in. It starts only once the night above it (the end of the
// approvals scroll, a separate element) has left the screen, so the two never look broken apart.
// Scrolling back up widens it again (scrubbed). Only clip-path changes. Desktop only; reduced
// motion: stays full width.

const CARD_W = 1160; // the content frame: 1200 px minus the side padding
const RADIUS = 44;
/** Where the night above ends inside this section (it is pulled up under the title by this much). */
const OVERLAP = () => window.innerHeight * 0.5 - 130;

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
        scrollTrigger: {
          trigger: el,
          start: () => `top+=${OVERLAP()} top`,
          end: "bottom 55%",
          scrub: 0.6,
          invalidateOnRefresh: true,
          onRefresh: render,
        },
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
