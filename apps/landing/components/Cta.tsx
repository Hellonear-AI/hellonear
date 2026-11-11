"use client";

import { useEffect, useRef, useState } from "react";
import { I, Icon } from "./Sections";

// "Ready to meet your Mind?": no card, straight on the page. The copy is on the left; on the right a
// big Mind flies in from the screen's right edge on a rocket-fire trail (one transparent image, its
// flames running off the edge). When the section comes into view the heading slides up word by word
// and the Mind flies in, then it hovers gently. Reduced motion: no slide-ups, no flight.

const TITLE = "Ready to meet your Mind?";

export function Cta() {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const words = TITLE.split(" ");

  return (
    <section ref={ref} className="relative overflow-hidden py-24 lg:flex lg:min-h-[86vh] lg:items-center lg:py-0">
      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-5">
        <div className="flex max-w-[480px] flex-col gap-4">
          <h2 className="text-[40px] font-medium leading-[1.04] tracking-[-1.6px] sm:text-[52px] lg:text-[60px]" aria-label={TITLE}>
            {words.map((w, i) => (
              <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden="true">
                <span className={`inline-block ${seen ? "word-up" : "translate-y-full"}`} style={{ animationDelay: `${i * 70}ms` }}>
                  {w}
                </span>
                {i < words.length - 1 && " "}
              </span>
            ))}
          </h2>
          <p className={`text-[18px] leading-[1.5] text-[var(--color-text-2)] ${seen ? "rise-in" : "opacity-0"}`} style={{ animationDelay: "380ms" }}>
            Free to try on NEAR testnet. No real money involved.
          </p>
          {/* two buttons side by side, the same width, on every screen */}
          <div
            className={`cta-btns mt-3 grid grid-cols-2 gap-2.5 lg:w-fit ${seen ? "rise-in" : "opacity-0"}`}
            style={{ animationDelay: "480ms" }}
          >
            <a href="#minds" className="hero-btn hero-btn-primary hero-btn-lg justify-center">
              Meet your Mind <I d={Icon.arrow} size={16} />
            </a>
            <a href="https://github.com/Hellonear-AI/hellonear" className="hero-btn hero-btn-ghost hero-btn-lg justify-center">
              <I d={Icon.github} size={16} /> View on GitHub
            </a>
          </div>
        </div>
      </div>

      {/* The flying Mind: its flames run off the screen's right edge. */}
      <div
        className={`pointer-events-none relative ml-[8%] mt-10 w-[120%] sm:w-[95%] lg:absolute lg:right-[-4vw] lg:top-1/2 lg:ml-0 lg:mt-0 lg:w-[min(60vw,1080px)] lg:-translate-y-1/2 ${seen ? "cta-fly-in" : "opacity-0"}`}
        aria-hidden="true"
      >
        <div className="float-idle">
          {/* soft shadow under the Mind, as if it hovers over the page */}
          <div className="absolute left-[6%] top-[78%] h-[9%] w-[42%] rounded-[50%] bg-black/15 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/scenes/cta-flying.webp" alt="" width={1536} height={1024} loading="lazy" className="relative h-auto w-full" />
        </div>
      </div>
    </section>
  );
}
