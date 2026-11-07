"use client";

import { useEffect, useRef, useState } from "react";
import { MindStage, type MindClip } from "./MindStage";
import { GrassSlope } from "./GrassSlope";

// Layout: copy on the left over the sky, a big Mind peeking over the grass on the right.
// Everything is placed on a 1440 px wide stage, centred.
const SECTION_H = 900;
const CREST_Y = 650; // where the front hill's crest is; the Mind's hands grip it here
const MIND_X = 1010; // the Mind's centre on the stage
const K = 1.5; // hand image scale, matched to the 3D head

// Grassy hills are wider than the screen and centred on the Mind, so the flat middle of the crest
// sits under its hands. hill-front.webp: 2000 x 250, crest 70 px down; hill-mid.webp: 2000 x 297, crest 81 px down.
const HILL_W = "max(2400px, 150vw)";
const hillStyle = (crestFraction: number, crestY: number, centreX: number): React.CSSProperties => ({
  width: HILL_W,
  left: `calc(${centreX}px - ${HILL_W} / 2)`,
  top: `calc(${crestY}px - ${HILL_W} * ${crestFraction})`,
});


// Cumulus banks: the tall one behind the Mind, the other low on the left horizon (under the copy).
const CUMULUS = [
  { src: "cumulus-left", x: -300, y: 470, w: 1150, speed: 160 },
  { src: "cumulus-right", x: 470, y: 50, w: 1400, speed: 190 },
];

// Front slope (slope.webp, 2400 x 474): its flat crest is at about 78% of the width, ~25 px from the top.
// Drawn twice (second copy mirrored), so the canvas is 4800 wide; the Mind sits on the first copy's crest.
const SLOPE = { w: 2400, h: 474, crestX: 0.78, crestTop: 25 };


// Parallax depth of each layer: px of movement at the screen edge (cursor), and px per 100 px of scroll.
const DEPTH = { sky: [4, 24], clouds: [10, 18], mid: [24, 8], fg: [34, 0], copy: [6, 22] } as const;

/** Moves each layer by its depth: a little with the cursor, and at its own speed when scrolling. */
function useParallax(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 767px)").matches) return;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      cur.x += (target.x - cur.x) * 0.06;
      cur.y += (target.y - cur.y) * 0.06;
      const sy = Math.min(window.scrollY, SECTION_H) / 100;
      for (const [name, [d, s]] of Object.entries(DEPTH)) {
        el.style.setProperty(
          `--p-${name}`,
          `translate3d(${(-cur.x * d).toFixed(2)}px, ${(-cur.y * d * 0.5 + sy * s).toFixed(2)}px, 0)`,
        );
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [ref]);
}

const layer = (name: keyof typeof DEPTH): React.CSSProperties => ({ transform: `var(--p-${name})`, willChange: "transform" });

/** 2D hands (relit to match the 3D head), in step with the Mind's clips:
    enter: both rise from behind the hill and grab the crest; hi: the screen-left hand waves once. */
function Hands({ clip, layer: which }: { clip: { name: MindClip; n: number } | null; layer: "behind" | "front" }) {
  if (!clip) return null;
  const waving = clip.name === "hi";
  const grip = (side: "left" | "right", delay: number) => (
    <div
      key={`${side}-${clip.n}-${waving && side === "left" ? "w" : "g"}`}
      className="hero-hand-clip absolute"
      style={{ left: MIND_X + (side === "left" ? -118 : 118) * K - 100 * K, top: 0, width: 200 * K, height: CREST_Y + 90 * K }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/hero/grip-${side}.webp`}
        alt=""
        aria-hidden="true"
        className={`absolute ${clip.name === "enter" ? "hero-hand-enter" : "hero-hand-grip"}`}
        style={{ width: 128 * K, left: 36 * K, top: CREST_Y - 34 * K, animationDelay: `${delay}s` }}
      />
    </div>
  );
  if (which === "front") {
    return (
      <>
        {!(waving) && grip("left", clip.name === "enter" ? 0 : 0.05)}
        {grip("right", clip.name === "enter" ? 0.12 : 0)}
      </>
    );
  }
  return waving ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={`wave-${clip.n}`}
      src="/hero/wave-left.webp"
      alt=""
      aria-hidden="true"
      className="hero-hand-wave absolute"
      style={{ width: 170 * K, left: MIND_X - 250 * K - 85 * K, top: CREST_Y - 170 * K * 0.92, transformOrigin: "70% 95%" }}
    />
  ) : null;
}

function Sky() {
  return (
    <svg
      viewBox="0 0 2400 960"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute max-w-none"
      style={{ left: "calc(720px - max(2400px, 130vw) / 2)", top: -40, width: "max(2400px, 130vw)", height: 980 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sky-g" x1="0" y1="0" x2="0" y2="1">
          {/* A soft, slightly hazy summer sky that sits with the Stone & Lime tokens: muted blue at
              the top, fading into the warm stone of the page (#F3F2EE) at the horizon. */}
          <stop offset="0" stopColor="#5F8FC4" />
          <stop offset="0.25" stopColor="#7DA5D2" />
          <stop offset="0.5" stopColor="#A3C1DF" />
          <stop offset="0.72" stopColor="#C9DAE6" />
          <stop offset="0.9" stopColor="#E3E6E2" />
          <stop offset="1" stopColor="#EFEDE6" />
        </linearGradient>
        <radialGradient id="sky-sun" cx="0.06" cy="0.02" r="0.55">
          <stop offset="0" stopColor="#FFF1DC" stopOpacity="0.9" />
          <stop offset="0.18" stopColor="#F8D7BC" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#BFE3FF" stopOpacity="0.12" />
          <stop offset="1" stopColor="#BFE3FF" stopOpacity="0" />
        </radialGradient>
        <filter id="sky-soft" x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="9 3" />
        </filter>
      </defs>
      <rect width="2400" height="960" fill="url(#sky-g)" />
      <rect width="2400" height="960" fill="url(#sky-sun)" />
      {/* Cirrus: long thin streaks, rising to the right like the reference. */}
      <g filter="url(#sky-soft)" fill="#FFFFFF">
        {[
          [260, 300, 520, 0.35],
          [520, 250, 380, 0.28],
          [900, 200, 600, 0.3],
          [1300, 150, 460, 0.22],
          [1750, 230, 540, 0.26],
          [700, 380, 300, 0.18],
          [1500, 330, 340, 0.16],
        ].map(([x, y, w, o], k) => (
          <ellipse key={k} cx={x} cy={y} rx={w / 2} ry={6 + (k % 3) * 3} opacity={o} transform={`rotate(-14 ${x} ${y})`} />
        ))}
      </g>
    </svg>
  );
}

function HeroCopy() {
  return (
    <>
            <h1 className="text-[46px] font-medium leading-[1.04] tracking-[-1.6px] text-[var(--color-text)]">
              A Mind that can&apos;t spend more than you allow.
            </h1>
            <p className="max-w-[400px] text-[16px] leading-[1.5] text-[#2E3A46]">
              An AI helper with its own wallet. You set the limits, it can&apos;t change them.
            </p>
            <div className="mt-1 flex items-center gap-2.5">
              <a href="#minds" className="hero-btn hero-btn-primary">
                Meet your Mind
                <span className="hero-btn-dot" aria-hidden="true">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </span>
              </a>
              <a href="#demo" className="hero-btn hero-btn-ghost">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 4.5v15l13-7.5z" />
                </svg>
                Watch the demo
              </a>
            </div>
            <ul className="flex items-center gap-3 text-[13px] text-[#2E3A46]">
            <li>Works with</li>
            {[
              ["gmail.svg", "Gmail"],
              ["meteor-wallet.png", "Meteor Wallet"],
              ["google-calendar.png", "Google Calendar"],
            ].map(([f, name]) => (
              <li key={name} className="flex items-center gap-1.5 rounded-full bg-white/60 px-2.5 py-1 font-medium text-[var(--color-text)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/brands/${f}`} alt="" aria-hidden="true" className="h-3.5 w-auto" />
                {name}
              </li>
            ))}
          </ul>
    </>
  );
}

/** Phones: no WebGL and no parallax. The Mind is two stills rendered from the same rig
    (head behind the grass, hands in front), under the copy. */
const M_CREST = 300; // crest line, px from the top of the Mind block
function HeroMobile() {
  // mobile-back.webp is 720 x 610 with the crest 87.1% down; at 1500 px wide the slope's flat crest
  // (65% to 99% of its width) is about 500 px wide and 16 px down, wide enough for the Mind.
  const mind: React.CSSProperties = { width: "min(94vw, 460px)", left: "50%", transform: "translateX(-50%)", top: `calc(${M_CREST}px - min(94vw, 460px) * ${(610 / 720) * 0.8711})` };
  return (
    <section className="hero relative overflow-hidden bg-[#7DA5D2] md:hidden">
      <div className="absolute left-1/2 top-0 h-full w-[1440px] -translate-x-1/2">
        <Sky />
      </div>
      <div className="relative z-10 flex flex-col items-start gap-4 px-5 pt-[104px] [&_.hero-btn]:h-11 [&_.hero-btn]:px-4 [&_.hero-btn]:text-[14px] [&_.hero-btn]:whitespace-nowrap [&_h1]:text-[34px] [&_ul]:flex-wrap [&_ul]:gap-x-2 [&_ul]:gap-y-1">
        <HeroCopy />
      </div>
      <div className="relative mt-4 h-[420px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero/mobile-back.webp" alt="" aria-hidden="true" className="absolute max-w-none" style={mind} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero/slope.webp" alt="" aria-hidden="true" className="absolute max-w-none" style={{ width: 1500, left: "calc(50% - 1170px)", top: M_CREST - 16 }} />
        <div className="absolute inset-x-0 bottom-0 bg-[#406708]" style={{ top: M_CREST + 270 }} />
        {/* Hands: the same relit 2D grips as on desktop. The head fills ~99% of the image width;
            each grip is 25% of the head wide, its centre 23% of the head from the middle. */}
        {(["left", "right"] as const).map((side) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={side}
            src={`/hero/grip-${side}.webp`}
            alt=""
            aria-hidden="true"
            className="absolute max-w-none"
            style={{
              width: "calc(min(94vw, 460px) * 0.25)",
              left: `calc(50% ${side === "left" ? "-" : "+"} min(94vw, 460px) * 0.23 - min(94vw, 460px) * 0.125)`,
              top: `calc(${M_CREST}px - min(94vw, 460px) * 0.067)`,
            }}
          />
        ))}
      </div>
    </section>
  );
}

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  useParallax(ref);
  const [clip, setClip] = useState<{ name: MindClip; n: number } | null>(null);
  const backToGrip = useRef<number | undefined>(undefined);
  const onClip = (name: MindClip) => {
    if (name === "idle") return; // the hands keep their grip
    setClip((c) => ({ name, n: (c?.n ?? 0) + 1 }));
    if (name === "hi") {
      window.clearTimeout(backToGrip.current);
      backToGrip.current = window.setTimeout(() => setClip((c) => ({ name: "idle", n: (c?.n ?? 0) + 1 })), 1500);
    }
  };
  // The 3D Mind loads only on screens wide enough for the desktop hero.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const set = () => setWide(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  return (
    <>
    <HeroMobile />
    <section
      ref={ref}
      className="hero relative hidden overflow-hidden bg-[#7DA5D2] md:block"
      style={{ height: SECTION_H }}
    >
      {/* Ground below the front hill art (its bottom colour), for tall or wide screens. */}
      <div className="absolute inset-x-0 bottom-0 bg-[#406708]" style={{ top: CREST_Y + 220 }} />


      <div className="absolute left-1/2 top-0 h-full w-[1440px] -translate-x-1/2">
        {/* Our own sky (colours sampled from the reference sky art): deep blue at the top, light near
            the horizon, a warm sun glow in the top-left corner and a few thin cirrus streaks. */}
        <div className="absolute inset-0" style={layer("sky")}>
          <Sky />
        </div>

        <div className="absolute inset-0" style={layer("clouds")}>
          {CUMULUS.map((c) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={c.src}
              src={`/hero/${c.src}.webp`}
              alt=""
              aria-hidden="true"
              className="hero-cloud pointer-events-none absolute max-w-none"
              style={{ left: c.x, top: c.y, width: c.w, animationDuration: `${c.speed}s` }}
            />
          ))}
        </div>

        <div className="absolute inset-0" style={layer("mid")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero/hill-mid.webp"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute max-w-none saturate-[1.15]"
            style={hillStyle(81 / 2000, CREST_Y - 40, 600)}
          />
        </div>

        {/* Foreground: the Mind, its hands and the hill it grips move together. */}
        <div className="absolute inset-0" style={layer("fg")}>
          {wide && <MindStage crestY={CREST_Y} centerX={MIND_X} onClip={onClip} />}
          <Hands clip={clip} layer="behind" />
          <GrassSlope
            src="/hero/slope.webp"
            className="pointer-events-none absolute z-[2] max-w-none"
            style={{
              left: MIND_X - SLOPE.w * SLOPE.crestX,
              top: CREST_Y - SLOPE.crestTop,
              width: SLOPE.w * 2,
              height: SLOPE.h,
            }}
          />
          <div className="absolute inset-0 z-[3]">
            <Hands clip={clip} layer="front" />
          </div>
        </div>


        {/* Sunlight from the top-left corner (where the sky's sun glow is), falling across the Mind too,
            under the copy so the text stays solid. It reaches past the stage on wide screens. */}
        <div className="hero-rays pointer-events-none absolute z-[5]" aria-hidden="true" />

        <div
          className="absolute left-[120px] top-[210px] z-10 flex w-[460px] flex-col items-start gap-5"
          style={layer("copy")}
        >
          <HeroCopy />
        </div>
      </div>
    </section>
    </>
  );
}
