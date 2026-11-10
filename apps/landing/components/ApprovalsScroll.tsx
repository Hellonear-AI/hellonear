"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ApprovalScene, Icon, Point } from "./Sections";

gsap.registerPlugin(ScrollTrigger);

// "Every payment asks you first": when the section comes into view, the title slides up word by word
// behind a mask (like the Minds heading), then the subtitle and points slide up one by one. The big scene frame
// opens from the right edge with the scroll (scrubbed). The copy reverses when scrolling back above.
// Reduced motion: no animation.

const LINES = ["Every payment", "asks you first"];

function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((w, i, all) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <span className="ap-word inline-block">{w}</span>
          {i < all.length - 1 && "\u00A0"}
        </span>
      ))}
    </>
  );
}

export function ApprovalsScroll() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Copy: plays once the section is in view, reverses above it.
      const tl = gsap
        .timeline({ paused: true })
        .fromTo(q(".ap-word"), { yPercent: 105 }, { yPercent: 0, duration: 0.7, stagger: 0.07, ease: "power3.out" })
        .fromTo(q(".ap-reveal"), { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.1, ease: "power2.out" }, 0.45);
      ScrollTrigger.create({ trigger: el, start: "top 65%", onEnter: () => tl.play(), onLeaveBack: () => tl.reverse() });

      // Photo: opens with the scroll (scrubbed), so the next step (the move into "Tricked") can
      // continue from it without a jump.
      gsap
        .timeline({ scrollTrigger: { trigger: el, start: "top 85%", end: "top 15%", scrub: 0.6 } })
        .fromTo(q(".ap-visual"), { clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 0%)", ease: "power2.out" }, 0)
        .fromTo(q(".ap-scene-bg"), { xPercent: 6, scale: 1.06 }, { xPercent: 0, scale: 1, ease: "power2.out" }, 0);
    });

    return () => mm.revert();
  }, []);

  return (
    <section ref={root} id="how-it-works" className="relative">
      <div className="relative flex min-h-[100svh] items-center overflow-hidden">
        {/* Copy: left column of the 1200 px container. */}
        <div className="relative z-10 mx-auto w-full max-w-[1200px] px-5 py-24">
          <div className="flex w-full flex-col gap-5 md:w-[440px]">
            <h2 className="text-[40px] font-medium leading-[1.04] tracking-[-1.6px] md:text-[60px]" aria-label={LINES.join(" ")}>
              {LINES.map((line) => (
                <span key={line} className="block" aria-hidden="true">
                  <Words text={line} />
                </span>
              ))}
            </h2>
            <p className="ap-reveal text-[17px] leading-[1.5] text-[var(--color-text-2)]">
              Penny finds the bill and gets it ready. Nothing leaves the wallet until you tap Approve.
            </p>
            <ul className="flex flex-col gap-3">
              <Point className="ap-reveal" d={Icon.ban}>Over your per-payment limit? Refused before signing, even if you approve.</Point>
              <Point className="ap-reveal" d={Icon.list}>Only addresses on your list can be paid.</Point>
              <Point className="ap-reveal" d={Icon.snow}>Freeze the wallet in one tap, any time.</Point>
            </ul>
          </div>
        </div>
        {/* The frame: from the end of the copy column to the right edge of the screen, no gap. */}
        <div
          className="ap-visual mt-8 h-[520px] md:absolute md:right-0 md:top-1/2 md:mt-0 md:h-[78vh] md:max-h-[760px] md:-translate-y-1/2"
          style={{ left: "max(500px, calc((100vw - 1200px) / 2 + 520px))" }}
        >
          <ApprovalScene />
        </div>
      </div>
    </section>
  );
}
