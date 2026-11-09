"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ApprovalScene, Icon, Point } from "./Sections";

gsap.registerPlugin(ScrollTrigger);

// "Every payment asks you first", told with the scroll (desktop):
// 1. The title comes up right under the cards and then holds in the middle of the screen, while it runs
//    in from the right edge like running text: each letter is small as it enters and full size once
//    inside. The title is one huge line across the screen.
// 2. The section pins. Scrolling on, the title shrinks into its place in the left column, breaking into
//    two lines ("Every payment" / "asks you first"), while the approval card pops in from the right.
// 3. Then the subtitle and the three points slide up one by one. A big frame (nature, glass UI, Penny)
//    swipes in from the right edge.
// Phones and reduced motion: the final layout, with simple reveals (phones) or none.

const LINES = ["Every payment", "asks you first"];

function Chars({ text, still = 0 }: { text: string; still?: number }) {
  // The first `still` words are already in place (the preview); the rest fly in.
  return (
    <>
      {text.split(" ").map((word, w, words) => (
        <span key={w} className="inline-block whitespace-nowrap">
          {[...word].map((ch, i) => (
            <span key={i} className={`${w < still ? "" : "ap-char "}inline-block will-change-transform`}>
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
      const run = q(".ap-run")[0] as HTMLElement;
      const lift = q(".ap-lift")[0] as HTMLElement;
      const line2 = q(".ap-line2")[0] as HTMLElement;
      const line1 = q(".ap-line1")[0] as HTMLElement;
      const pin = q(".ap-pin")[0] as HTMLElement;
      const chars = q(".ap-char") as HTMLElement[];
      const vw = () => window.innerWidth;
      const vh = () => window.innerHeight;

      // The "big" state, measured from the final layout: both lines on one row, 80% of the screen
      // wide, centred in the pinned screen. Recomputed on resize.
      const big = () => {
        gsap.set([title, line2, run, lift], { clearProps: "transform" });
        const t = title.getBoundingClientRect();
        const p = pin.getBoundingClientRect();
        const l1 = line1.getBoundingClientRect();
        const l2 = line2.getBoundingClientRect();
        const gap = parseFloat(getComputedStyle(title).fontSize) * 0.28;
        const total = l1.width + gap + l2.width;
        const scale = Math.min((vw() * 0.8) / total, 2.6);
        const left = (vw() - total * scale) / 2;
        return {
          scale,
          left,
          h: l1.height * scale,
          x: left - t.left,
          y: (vh() - l1.height * scale) / 2 - (t.top - p.top),
          l2x: l1.width + gap - (l2.left - l1.left),
          l2y: -(l2.top - l1.top),
          // Running-text start: the whole line just past the right edge (in the title's units).
          runFrom: (vw() + 20 - left) / scale,
        };
      };
      let b = big();
      const setBig = () => {
        b = big();
        gsap.set(title, { x: b.x, y: b.y, scale: b.scale, transformOrigin: "0 0" });
        gsap.set(line2, { x: b.l2x, y: b.l2y });
      };
      setBig();
      gsap.set(chars, { transformOrigin: "50% 80%" });

      // Each letter is small while it is still entering at the right edge and full size once it is
      // well inside the screen; at the end every letter is inside, so all are full size.
      const sizeLetters = () => {
        const edge = vw() * 0.97;
        const zone = vw() * 0.07;
        for (const c of chars) {
          const r = c.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const k = gsap.utils.clamp(0, 1, (edge - cx) / zone);
          gsap.set(c, { scale: 0.25 + 0.75 * k, opacity: gsap.utils.clamp(0, 1, (vw() - cx) / (vw() * 0.03)) });
        }
      };

      // Before the pin: the title comes up right under the cards, then stays in the middle of the
      // screen (it rises with the page until it reaches the centre, then holds there).
      const placeLift = () => {
        const top = el.getBoundingClientRect().top;
        const y = Math.max(-top, 120 + b.h / 2 - vh() / 2);
        gsap.set(lift, { y: Math.min(0, y) });
      };
      ScrollTrigger.create({ trigger: el, start: "top bottom", end: "top top", onUpdate: placeLift, onRefresh: placeLift });

      // 1. Running text: the line slides in from the right edge, at the scroll speed, until it is in
      //    place 900 px into the pin.
      const LETTERS = 900;
      const MOVE = 900;
      const CARD = 500;
      gsap.fromTo(
        run,
        { x: () => b.runFrom },
        {
          x: 0,
          ease: "none",
          onUpdate: sizeLetters,
          scrollTrigger: { trigger: el, start: "top bottom", end: `top -${LETTERS}px`, scrub: 0.5, invalidateOnRefresh: true },
        },
      );
      sizeLetters();

      // Subtitle and points: not tied to the scroll. They play once the title is in place, and go
      // back when the user scrolls up past that point.
      const reveal = gsap
        .timeline({ paused: true })
        .fromTo(q(".ap-reveal"), { y: 36, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.12, ease: "power2.out" });

      // 2. Pinned: the title moves to its place; the card pops in only when the title is almost
      //    there, so they never cross (also when scrolling back up).
      const total = LETTERS + MOVE + CARD;
      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: `+=${total}`,
          pin: pin,
          scrub: 0.8,
          invalidateOnRefresh: true,
          onRefreshInit: setBig,
          onUpdate: (self) => {
            const shown = self.progress >= (LETTERS + MOVE * 0.95) / total;
            if (shown && reveal.reversed() !== false) reveal.play();
            else if (!shown && reveal.progress() > 0 && !reveal.reversed()) reveal.reverse();
          },
        },
      });
      tl.to({}, { duration: LETTERS })
        .to(title, { x: 0, y: 0, scale: 1, duration: MOVE }, LETTERS)
        // The second line drops below first, then slides left, so the two lines never cross.
        .to(line2, { y: 0, duration: MOVE * 0.55, ease: "power2.out" }, LETTERS)
        .to(line2, { x: 0, duration: MOVE * 0.8, ease: "power2.inOut" }, LETTERS + MOVE * 0.2)
        // The frame swipes in from the right edge (a wipe, its contents slide a little slower).
        .fromTo(q(".ap-visual"), { clipPath: "inset(0 0 0 100%)" }, { clipPath: "inset(0 0 0 0%)", duration: CARD, ease: "power3.out" }, LETTERS + MOVE * 0.75)
        .fromTo(q(".ap-scene-bg"), { xPercent: 12 }, { xPercent: 0, duration: CARD, ease: "power3.out" }, LETTERS + MOVE * 0.75)
        .fromTo(q(".ap-penny"), { xPercent: 30, autoAlpha: 0 }, { xPercent: 0, autoAlpha: 1, duration: CARD * 0.9, ease: "power3.out" }, LETTERS + MOVE * 0.85);
      reveal.reverse(); // start "reversed" so the first play() runs it forward

      return () => gsap.set([title, line2, run, lift, ...chars], { clearProps: "transform,opacity" });
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
      <div className="ap-pin relative flex min-h-screen items-center overflow-hidden">
        {/* Copy: left column of the 1200 px container. */}
        <div className="relative z-10 mx-auto w-full max-w-[1200px] px-5 py-24">
          <div className="flex w-full flex-col gap-5 md:w-[440px]">
            <div className="ap-lift">
            <h2 className="ap-title text-[40px] font-medium leading-[1.04] tracking-[-1.6px] md:text-[60px]" aria-label={LINES.join(" ")}>
              <span className="ap-run block w-fit">
                <span className="ap-line1 block w-fit" aria-hidden="true">
                  <Chars text={LINES[0]} />
                </span>
                <span className="ap-line2 block w-fit" aria-hidden="true">
                  <Chars text={LINES[1]} />
                </span>
              </span>
            </h2>
            </div>
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
