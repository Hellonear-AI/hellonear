"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ApprovalVisual, Icon, Point } from "./Sections";

gsap.registerPlugin(ScrollTrigger);

// "Every payment asks you first", told with the scroll (desktop):
// 1. While the section comes up, the title flies in letter by letter from the right, each letter small
//    at first and full size when it lands. The title is one huge line across the screen.
// 2. The section pins. Scrolling on, the title shrinks into its place in the left column, breaking into
//    two lines ("Every payment" / "asks you first"), while the approval card pops in from the right.
// 3. Then the subtitle and the three points slide up one by one. The card keeps floating gently.
// Phones and reduced motion: the final layout, with simple reveals (phones) or none.

const LINES = ["Every payment", "asks you first"];

function Chars({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, w, words) => (
        <span key={w} className="inline-block whitespace-nowrap">
          {[...word].map((ch, i) => (
            <span key={i} className="ap-char inline-block will-change-transform">
              {ch}
            </span>
          ))}
          {w < words.length - 1 && <span className="inline-block">&nbsp;</span>}
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

    mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
      const title = q(".ap-title")[0] as HTMLElement;
      const line2 = q(".ap-line2")[0] as HTMLElement;
      const line1 = q(".ap-line1")[0] as HTMLElement;
      const pin = q(".ap-pin")[0] as HTMLElement;

      // The "big" state, measured from the final layout: both lines on one row, scaled to fill the
      // width, centred in the pinned screen. Recomputed on resize.
      const big = () => {
        gsap.set([title, line2], { clearProps: "transform" });
        const t = title.getBoundingClientRect();
        const p = pin.getBoundingClientRect();
        const l1 = line1.getBoundingClientRect();
        const l2 = line2.getBoundingClientRect();
        const gap = parseFloat(getComputedStyle(title).fontSize) * 0.28;
        const total = l1.width + gap + l2.width;
        const scale = Math.min((window.innerWidth * 0.9) / total, 2.6);
        return {
          scale,
          x: (window.innerWidth - total * scale) / 2 - t.left,
          y: (window.innerHeight - l1.height * scale) / 2 - (t.top - p.top),
          l2x: l1.width + gap - (l2.left - l1.left),
          l2y: -(l2.top - l1.top),
        };
      };
      let b = big();
      const setBig = () => {
        b = big();
        gsap.set(title, { x: b.x, y: b.y, scale: b.scale, transformOrigin: "0 0" });
        gsap.set(line2, { x: b.l2x, y: b.l2y });
      };
      setBig();

      // 1. Letters fly in from the right while the section comes up (starts before it reaches the top,
      //    so it is already half there when the user arrives).
      gsap.fromTo(
        q(".ap-char"),
        { xPercent: 260, scale: 0.25, opacity: 0, transformOrigin: "100% 80%" },
        {
          xPercent: 0,
          scale: 1,
          opacity: 1,
          ease: "power3.out",
          stagger: 0.035,
          scrollTrigger: { trigger: el, start: "top 95%", end: "top 5%", scrub: 0.6 },
        },
      );

      // 2 + 3. Pinned: title to its place, the card pops in, then the copy slides up.
      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: "+=1500",
          pin: pin,
          scrub: 0.8,
          invalidateOnRefresh: true,
          onRefreshInit: setBig,
        },
      });
      tl.to(title, { x: 0, y: 0, scale: 1, duration: 1 }, 0)
        .to(line2, { x: 0, y: 0, duration: 1 }, 0)
        .fromTo(
          q(".ap-visual"),
          { xPercent: 70, scale: 0.7, rotate: 8, autoAlpha: 0 },
          { xPercent: 0, scale: 1, rotate: 0, autoAlpha: 1, duration: 0.9, ease: "back.out(1.6)" },
          0.2,
        )
        .fromTo(q(".ap-reveal"), { y: 36, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.22, ease: "power2.out" }, 1.05)
        .to({}, { duration: 0.3 }); // a short hold at the end before the page moves on

      return () => gsap.set([title, line2], { clearProps: "transform" });
    });

    // Phones: no pin; things slide up as they come into view.
    mm.add("(max-width: 767px) and (prefers-reduced-motion: no-preference)", () => {
      q(".ap-reveal, .ap-visual, .ap-title").forEach((n) =>
        gsap.from(n, { y: 30, autoAlpha: 0, duration: 0.6, ease: "power2.out", scrollTrigger: { trigger: n, start: "top 88%" } }),
      );
    });

    return () => mm.revert();
  }, []);

  return (
    <section ref={root} id="how-it-works" className="relative">
      <div className="ap-pin flex min-h-screen items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-[1200px] items-center gap-14 px-5 py-24 md:grid-cols-[480px_1fr]">
          <div className="flex flex-col gap-5">
            <h2 className="ap-title text-[40px] font-medium leading-[1.04] tracking-[-1.6px] md:text-[60px]" aria-label={LINES.join(" ")}>
              <span className="ap-line1 block w-fit" aria-hidden="true">
                <Chars text={LINES[0]} />
              </span>
              <span className="ap-line2 block w-fit" aria-hidden="true">
                <Chars text={LINES[1]} />
              </span>
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
          <div className="ap-visual">
            <div className="float-idle">
              <ApprovalVisual />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
