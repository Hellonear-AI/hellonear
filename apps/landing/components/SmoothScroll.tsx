"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger);

// Smooth wheel scrolling with Lenis (Axel, 13 Nov). It drives the page's own scroll (no wrapper), so
// position: sticky, the GSAP pins and every scrollY reader keep working. Lenis runs on GSAP's ticker
// and tells ScrollTrigger on every scroll, so the scrubbed approvals scene and the pins move in step
// with it. Touch keeps the device's own scrolling (Lenis' default). Reduced motion: no Lenis.
// Held still while the page loader covers the page, as the loader locks the scroll.
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: false, anchors: false });
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const revealed = (window as unknown as { __hnRevealed?: boolean }).__hnRevealed;
    if (!revealed) lenis.stop();
    const start = () => lenis.start();
    window.addEventListener("hn:reveal", start);
    return () => {
      window.removeEventListener("hn:reveal", start);
      gsap.ticker.remove(tick);
      lenis.destroy();
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
    };
  }, []);
  return null;
}
