"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ApprovalScene, Icon, Point } from "./Sections";
import { GRAPH_SUB } from "./Sections";
import { NIGHT_BG, Starfield } from "./Starfield";

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

    });

    // The scene: a window (clip-path) over the fixed-size stage, both driven by two numbers, so nothing
    // is laid out again while scrolling (only clip-path and transform change).
    //   open  0..1  the window opens from the right edge (scrubbed, before the pin)
    //   track 0..1  pinned: the window grows to the whole screen and the stage scales up and moves left,
    //               so the camera passes the Mind and lands on "Tricked?" (desktop only)
    //   up    0..1  still pinned: soft blurred clouds and fog rise from the bottom and slowly cover the
    //               lawn; behind them it turns to night with the Mind Graph's title already in place;
    //               then the white clouds fade and the title is there on the stars, with the graph
    //               (the next section, same night) right below it.
    const STAGE_W = 1680;
    const STAGE_H = 722;
    const visual = q(".ap-visual")[0] as HTMLElement;
    const stage = q(".ap-stage")[0] as HTMLElement;
    const copy = q(".ap-copy")[0] as HTMLElement;
    const tricked = q(".ap-tricked")[0] as HTMLElement;
    const sky = q(".ap-sky")[0] as HTMLElement;
    const stars = q(".ap-stars")[0] as HTMLElement;
    const fogLight = q(".ap-fog-light")[0] as HTMLElement;
    const graphTitle = q(".ap-graph-title")[0] as HTMLElement;
    const clouds = q(".ap-cloud") as HTMLElement[];
    const st = { open: 0, track: 0, up: 0 };
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const smooth = (a: number, b: number, v: number) => {
      const x = clamp((v - a) / (b - a));
      return x * x * (3 - 2 * x);
    };
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const render = () => {
      const W = visual.clientWidth;
      const H = visual.clientHeight;
      const desktop = window.innerWidth >= 768;
      if (!desktop) {
        // phones: the frame is a plain block; the stage fills its height from the left
        const s0 = H / STAGE_H;
        visual.style.clipPath = "";
        stage.style.transform = `translate3d(0,0,0) scale(${s0})`;
        tricked.style.opacity = "0";
        return;
      }
      const L0 = Math.max(500, (W - 1200) / 2 + 520);
      const H0 = Math.min(H * 0.78, 760);
      const T0 = (H - H0) / 2;
      const t = st.track; // linear, like the scroll before the pin, so the hand-off doesn't jolt
      // the window
      const left = lerp(lerp(W, L0, st.open), 0, t);
      const top = lerp(T0, 0, t);
      const h = lerp(H0, H, t);
      const r = lerp(36, 0, t);
      visual.style.clipPath = `inset(${top}px 0px ${H - top - h}px ${left}px round ${r}px 0 0 ${r}px)`;
      // the stage: at rest it sits in the window at the window's height; at the end it fills the screen
      // and its right edge meets the screen's right edge
      const s0 = H0 / STAGE_H;
      const s1 = H / STAGE_H;
      const sc = lerp(s0, s1, t);
      const x0 = L0 + (1 - st.open) * 90; // a little parallax while it opens
      const x1 = W - STAGE_W * s1;
      const sx = lerp(x0, x1, t);
      stage.style.transform = `translate3d(${sx}px, ${lerp(T0, 0, t)}px, 0) scale(${sc})`;
      // into the clouds: fog and blurred clouds rise and cover the lawn; under that cover it turns to
      // night; then they keep rising and thin out onto the stars. Every fade starts at zero slope, so
      // nothing pops in.
      const u = st.up;
      sky.style.visibility = u > 0 ? "visible" : "hidden";
      sky.style.opacity = String(smooth(0.4, 0.5, u));
      stars.style.opacity = String(smooth(0.45, 0.55, u));
      fogLight.style.opacity = String(smooth(0.18, 0.45, u) * (1 - smooth(0.58, 0.9, u)));
      fogLight.style.transform = `translate3d(0, ${H * (0.55 - 0.9 * u)}px, 0)`;
      clouds.forEach((c, i) => {
        const k = [1, 1.2, 0.9, 1.35][i];
        const y = H * (1.0 + i * 0.12 - 1.5 * u * k);
        c.style.transform = `translate3d(0, ${y}px, 0) scale(${1.1 + 0.3 * u})`;
        c.style.opacity = String(smooth(0.0, 0.3, u) * (1 - smooth(0.58, 0.85, u)));
      });
      // the Mind Graph's title waits behind the clouds and settles as they clear
      graphTitle.style.transform = `translate3d(0, ${24 * (1 - smooth(0.55, 0.9, u))}px, 0)`;
      // the copy slides left with the photo, by the same distance (no fade)
      copy.style.transform = `translate3d(${sx - x0}px,0,0)`;
      // "Tricked?" sits at the photo's edge at rest; it comes in as the camera starts to move
      tricked.style.opacity = String(Math.min(1, Math.max(0, (st.track - 0.12) / 0.25)));
    };

    mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
      st.open = 0;
      st.track = 0;
      gsap.to(st, {
        open: 1,
        ease: "none",
        onUpdate: render,
        scrollTrigger: { trigger: el, start: "top 85%", end: "top top", scrub: 0.8 },
      });
      gsap
        .timeline({
          defaults: { ease: "none", onUpdate: render },
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "+=3150",
            pin: q(".ap-pin")[0],
            scrub: 0.8,
            onRefresh: render,
          },
        })
        .to(st, { track: 1, duration: 1600 })
        .to({}, { duration: 250 }) // a short hold on "Tricked?"
        .to(st, { up: 1, duration: 1300 });
      render();
      return () => {
        copy.style.transform = "";
        tricked.style.opacity = "";
      };
    });
    // Phones and reduced motion: the opened state, no pin.
    mm.add("(max-width: 767px), (prefers-reduced-motion: reduce)", () => {
      st.open = 1;
      st.track = 0;
      render();
    });
    const ro = new ResizeObserver(render);
    ro.observe(visual);

    return () => {
      ro.disconnect();
      mm.revert();
    };
  }, []);

  return (
    <section ref={root} id="how-it-works" className="relative">
      <div className="ap-pin relative flex min-h-[100svh] items-center overflow-hidden">
        {/* Copy: left column of the 1200 px container. */}
        <div className="relative z-10 mx-auto w-full max-w-[1200px] px-5 py-24">
          <div className="ap-copy flex w-full flex-col gap-5 md:w-[440px]">
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
        {/* The scene window: covers the whole pinned screen on desktop, shown through a clip-path. */}
        <div className="ap-visual relative mt-8 h-[520px] w-full overflow-hidden bg-[#4f7a2a] md:absolute md:inset-0 md:mt-0 md:h-auto md:[clip-path:inset(0_0_0_100%)]">
          <ApprovalScene />
          {/* Into the clouds (desktop only): the night behind, then the fog and blurred clouds in front. */}
          <div className="ap-sky invisible absolute inset-0 hidden opacity-0 md:block" style={{ background: NIGHT_BG }} aria-hidden="true">
            <div className="ap-stars absolute inset-0 opacity-0">
              <Starfield count={160} seed={11} />
            </div>
            {/* The Mind Graph's title, on the same night as the section below, so it is already there
                when the clouds clear and the graph follows right under it. */}
            <div className="absolute inset-x-0 bottom-[8vh]">
              <div className="ap-graph-title mx-auto flex max-w-[1200px] flex-col items-start gap-3 px-5 text-[#F2F1EC]">
                <h2 className="max-w-[760px] text-[48px] font-medium leading-[1.08] tracking-[-1.2px]">Watch your Mind think</h2>
                <p className="max-w-[600px] text-[17px] leading-[1.5] text-[#F2F1EC]/70">{GRAPH_SUB}</p>
              </div>
            </div>
          </div>
          {[
            ["cumulus-left", "-left-[15%] w-[85%]"],
            ["cumulus-right", "-right-[15%] w-[90%]"],
            ["cumulus-right", "left-[10%] w-[80%]"],
            ["cumulus-left", "-right-[5%] w-[95%]"],
          ].map(([img, pos], i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={`/hero/${img}.webp`}
              alt=""
              aria-hidden="true"
              className={`ap-cloud pointer-events-none absolute top-0 hidden opacity-0 will-change-transform md:block ${pos}`}
              style={{ filter: `blur(${[10, 16, 22, 28][i]}px)` }}
            />
          ))}
          <div className="ap-fog-light pointer-events-none absolute inset-x-0 -top-[60%] hidden h-[220%] opacity-0 will-change-transform md:block" style={{ background: "linear-gradient(transparent, #EEF0EC 30%, #EEF0EC 70%, transparent)" }} aria-hidden="true" />
          <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
