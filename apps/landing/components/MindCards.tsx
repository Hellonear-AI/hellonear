"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";

// "Pick a Mind you'd like around": three cards dealt from below, face down (a brushed platinum back
// with the logo), flipping over one by one. Hover pops a card up with a small random tilt and fades
// its character into a second, livelier pose. The Choose button opens the app's "Choose a Mind" screen with
// that template picked (`/minds/new?template=<id>`; apps/fe needs to read the param).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

const MINDS = [
  { id: "general-assistant", name: "General Assistant", role: "Plans your day", meta: "1 starter skill", tint: "#E3ECFB" },
  { id: "payments-mind", name: "Payments Mind", role: "Pays inside your limits", meta: "2 starter skills", tint: "#F1F8C9" },
  { id: "email-manager", name: "Email Manager", role: "Keeps your inbox calm", meta: "2 starter skills", tint: "#FBEFD9" },
];

const TITLE = "Pick a Mind you'd like around";

/** Plays once when the element first scrolls into view. */
function useInView<T extends Element>(threshold = 0.25) {
  const ref = useRef<T>(null);
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
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

function Arrow() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function Card({ m, k, dealt }: { m: (typeof MINDS)[number]; k: number; dealt: boolean }) {
  const [hot, setHot] = useState(false);
  const [tilt, setTilt] = useState(0);
  const href = `${APP_URL}/minds/new?template=${m.id}`;
  return (
    <div
      className="mind-card-hover group block [perspective:1400px]"
      style={{ "--tilt": `${tilt}deg` } as React.CSSProperties}
      onMouseEnter={() => {
        setTilt((Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2));
        setHot(true);
      }}
      onMouseLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
    >
      <div
        className={`mind-card relative [transform-style:preserve-3d] ${dealt ? "mind-card-deal" : "invisible"}`}
        style={{ animationDelay: `${0.15 + k * 0.22}s`, "--from-tilt": `${[-9, 4, 10][k]}deg` } as React.CSSProperties}
      >
        {/* Front */}
        <div className="mind-face-front flex flex-col gap-4 rounded-[32px] bg-[var(--color-surface)] p-3.5 shadow-[0_24px_60px_-28px_rgb(22_22_20/0.35)] " style={{ animationDelay: `${0.15 + k * 0.22}s` }}>
          <div className="relative h-[400px] overflow-hidden rounded-[24px]" style={{ backgroundColor: m.tint }}>
            <div className="relative z-10 flex flex-col items-center gap-1 pt-6 text-center">
              <h3 className="text-[28px] font-medium tracking-[-0.8px]">{m.name}</h3>
              <p className="flex items-center gap-2 text-[14px] text-[var(--color-text-2)]">
                <span className="relative grid size-2 place-items-center">
                  <span className="absolute size-2 animate-ping rounded-full bg-[var(--color-accent-strong)] opacity-40" />
                  <span className="size-2 rounded-full bg-[var(--color-accent-strong)]" />
                </span>
                {m.role}
              </p>
            </div>
            {/* The two poses cross-fade on hover. */}
            <div className="absolute inset-x-0 bottom-[-6%] top-[22%]">
              {(["", "-hover"] as const).map((v) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={v}
                  src={`/minds/${m.id}${v}.webp`}
                  alt={v ? "" : `${m.name} character`}
                  aria-hidden={v ? true : undefined}
                  className="absolute inset-0 h-full w-full object-contain object-bottom transition-opacity duration-300 ease-out"
                  style={{ opacity: (v === "-hover") === hot ? 1 : 0 }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 px-1.5 pb-1">
            <div className="flex items-center gap-3">
              <span className="relative size-10 overflow-hidden rounded-full" style={{ backgroundColor: m.tint }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/minds/${m.id}.webp`} alt="" aria-hidden="true" className="absolute left-1/2 top-0 w-[260%] max-w-none -translate-x-1/2" />
                <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-white bg-[var(--color-accent-strong)]" />
              </span>
              <span className="flex flex-col">
                <span className="text-[15px] font-medium">@{m.id.replace("-", "")}</span>
                <span className="text-[13px] text-[var(--color-text-3)]">{m.meta}</span>
              </span>
            </div>
            <a href={href} className="mind-card-cta" aria-label={`Choose ${m.name}`}>
              Choose
              <Arrow />
            </a>
          </div>
        </div>

        {/* Back: brushed platinum with the embossed logo */}
        <div className="mind-card-back mind-face-back pointer-events-none absolute inset-0 grid place-items-center rounded-[32px] [transform:rotateY(180deg)]" style={{ animationDelay: `${0.15 + k * 0.22}s` }}>
          <div className="mind-card-emboss w-[62%]">
            <Logo className="h-auto w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MeetMinds() {
  const [headRef, headSeen] = useInView<HTMLDivElement>(0.4);
  const [cardsRef, dealt] = useInView<HTMLDivElement>(0.2);
  return (
    <section id="minds" className="mx-auto flex max-w-[1200px] flex-col gap-12 px-5 py-24">
      <div ref={headRef} className="flex flex-col items-center gap-3 text-center">
        <h2 className="max-w-[760px] text-[36px] font-medium leading-[1.12] tracking-[-1.2px] md:text-[48px]" aria-label={TITLE}>
          {TITLE.split(" ").map((w, i) => (
            <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden="true">
              <span className={`inline-block ${headSeen ? "word-up" : "translate-y-full"}`} style={{ animationDelay: `${i * 70}ms` }}>
                {w}
              </span>
              {i < TITLE.split(" ").length - 1 && " "}
            </span>
          ))}
        </h2>
        <p
          className={`max-w-[600px] text-[17px] leading-[1.5] text-[var(--color-text-2)] ${headSeen ? "fade-in" : "opacity-0"}`}
          style={{ animationDelay: `${TITLE.split(" ").length * 70 + 200}ms` }}
        >
          Each one comes with a personality, a few starter skills and its own wallet. Change any of it later.
        </p>
      </div>
      <div ref={cardsRef} className="grid gap-6 md:grid-cols-3">
        {MINDS.map((m, k) => (
          <Card key={m.id} m={m} k={k} dealt={dealt} />
        ))}
      </div>
    </section>
  );
}
