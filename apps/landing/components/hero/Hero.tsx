"use client";

import { useEffect, useRef, useState } from "react";
import { MindHead, type MindStyle } from "./MindHead";
import { GrassSlope } from "./GrassSlope";

// Layout: copy on the left over the sky, a big Mind peeking over the grass on the right.
// Everything is placed on a 1440 px wide stage, centred.
const SECTION_H = 900;
const CREST_Y = 760; // where the front hill's crest is; the Mind's hands grip it here
const MIND_X = 1010; // the Mind's centre on the stage
const K = 1.6; // Mind scale (1 = the old 560 x 480 head)
const HEAD_W = 560 * K;
const HEAD_H = 480 * K;

// Grassy hills are wider than the screen and centred on the Mind, so the flat middle of the crest
// sits under its hands. hill-front.webp: 2000 x 250, crest 70 px down; hill-mid.webp: 2000 x 297, crest 81 px down.
const HILL_W = "max(2400px, 150vw)";
const hillStyle = (crestFraction: number, crestY: number, centreX: number): React.CSSProperties => ({
  width: HILL_W,
  left: `calc(${centreX}px - ${HILL_W} / 2)`,
  top: `calc(${crestY}px - ${HILL_W} * ${crestFraction})`,
});


// Which hand image each side shows per style. Thumbs always point to the middle.
const HANDS: Record<MindStyle, { left: string; right: string }> = {
  idle: { left: "grip-left", right: "grip-right" },
  wave: { left: "wave-left", right: "grip-right" },
  tap: { left: "grip-left", right: "tap-right" },
};

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

function Hand({ name, side, out = false }: { name: string; side: "left" | "right"; out?: boolean }) {
  // Gripping hands sit on the crest; raised hands stand behind it so the wrist is hidden.
  const raised = !name.startsWith("grip");
  const width = (raised ? 180 : 128) * K;
  // From the Mind's centre to the hand's centre: raised hands sit beside the face.
  const offset = (raised ? 250 : 118) * K;
  // Enter: raised hands spring up from behind the hill, gripping hands drop onto the crest and squash.
  // Exit: the old hand sinks away first, so the new one has room.
  const motion = out
    ? raised ? "hero-hand-out-raised" : "hero-hand-out-grip"
    : raised ? `hero-hand-rise hero-hand-${name.split("-")[0]}` : "hero-hand-grip";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/hero/${name}.webp`}
      alt=""
      aria-hidden="true"
      className={`hero-hand absolute ${motion}`}
      style={{
        width,
        left: MIND_X + (side === "left" ? -offset : offset) - width / 2,
        top: raised ? CREST_Y - width * 0.92 : CREST_Y - 34 * K,
        transformOrigin: raised ? (side === "left" ? "70% 95%" : "30% 95%") : "50% 100%",
      }}
    />
  );
}

/** The hands of one layer (raised = behind the front hill, grip = in front), with the old ones leaving. */
function HandLayer({ style, prev, raisedLayer }: { style: MindStyle; prev: MindStyle | null; raisedLayer: boolean }) {
  return (
    <>
      {(["left", "right"] as const).map((side) => {
        const cur = HANDS[style][side];
        const old = prev ? HANDS[prev][side] : null;
        const isRaised = (n: string) => !n.startsWith("grip");
        return (
          <span key={side}>
            {old && old !== cur && isRaised(old) === raisedLayer && (
              <Hand key={`${side}-${old}-out`} name={old} side={side} out />
            )}
            {isRaised(cur) === raisedLayer && <Hand key={`${side}-${cur}`} name={cur} side={side} />}
          </span>
        );
      })}
    </>
  );
}

/** Moves each layer by its depth: a little with the cursor, and at its own speed when scrolling. */
function useParallax(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
          <stop offset="0" stopColor="#0045AE" />
          <stop offset="0.2" stopColor="#0154C0" />
          <stop offset="0.4" stopColor="#076DD8" />
          <stop offset="0.6" stopColor="#2389EB" />
          <stop offset="0.8" stopColor="#54B1FB" />
          <stop offset="1" stopColor="#88CEFD" />
        </linearGradient>
        <radialGradient id="sky-sun" cx="0.06" cy="0.02" r="0.55">
          <stop offset="0" stopColor="#FFE9CF" stopOpacity="0.95" />
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

export function Hero() {
  const [style, setStyle] = useState<MindStyle>("idle");
  const [prev, setPrev] = useState<MindStyle | null>(null);
  const timers = useRef<number[]>([]);
  const ref = useRef<HTMLElement>(null);
  useParallax(ref);
  // A click is a quick "hi": the Mind waves once, then goes back to resting, like a one-shot reaction.
  const swap = (from: MindStyle, to: MindStyle) => {
    setPrev(from);
    setStyle(to);
    timers.current.push(window.setTimeout(() => setPrev(null), 260)); // the leaving hands are gone by then
  };
  const poke = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (style !== "wave") swap(style, "wave");
    timers.current.push(window.setTimeout(() => swap("wave", "idle"), 1700));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <section
      ref={ref}
      className="hero relative overflow-hidden bg-[#1E5FD0]"
      style={{ height: SECTION_H }}
    >
      {/* Ground below the front hill art (its bottom colour), for tall or wide screens. */}
      <div className="absolute inset-x-0 bottom-0 bg-[#406708]" style={{ top: CREST_Y + 200 }} />

      {/* Sunlight from the top-left corner (where the sky's sun glow is), falling across the Mind too.
          Outside the 1440 stage so it reaches the screen's left edge on wide screens. */}
      <div className="hero-rays pointer-events-none absolute z-[5]" aria-hidden="true" />

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
          {/* The head's bottom (chin) sits below the crest, hidden by the hill. */}
          <div className="absolute" style={{ left: MIND_X - HEAD_W / 2, top: CREST_Y - HEAD_H + 70 * K }}>
            <MindHead style={style} onPoke={poke} className="h-[768px] w-[896px]" />
          </div>
          <HandLayer style={style} prev={prev} raisedLayer />
          <GrassSlope
            src="/hero/slope.webp"
            className="pointer-events-none absolute max-w-none"
            style={{
              left: MIND_X - SLOPE.w * SLOPE.crestX,
              top: CREST_Y - SLOPE.crestTop,
              width: SLOPE.w * 2,
              height: SLOPE.h,
            }}
          />
          <HandLayer style={style} prev={prev} raisedLayer={false} />
        </div>


        <div
          className="absolute left-[120px] top-[210px] z-10 flex w-[460px] flex-col items-start gap-5"
          style={layer("copy")}
        >
          <h1 className="text-[46px] font-medium leading-[1.04] tracking-[-1.6px] text-white [text-shadow:0_2px_24px_rgb(10_40_100/0.25)]">
            A Mind that can&apos;t spend more than you allow.
          </h1>
          <p className="max-w-[400px] text-[16px] leading-[1.5] text-white/85">
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
          <ul className="flex items-center gap-3 text-[13px] text-white/75">
            <li>Works with</li>
            <li className="font-medium text-white">Gmail</li>
            <li aria-hidden="true">·</li>
            <li className="font-medium text-white">Meteor Wallet</li>
            <li aria-hidden="true">·</li>
            <li>
              <span className="font-medium text-white">Google Calendar</span> soon
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
