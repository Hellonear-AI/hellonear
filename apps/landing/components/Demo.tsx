"use client";

import { useEffect, useRef, useState } from "react";

// "Two minutes with a Mind": the heading slides up word by word and the steps rise in when the
// section comes into view (like the Minds heading). The video plays on its own, muted and looping,
// like a moving picture; a click opens it full screen from the start with sound, and leaving full
// screen mutes it and lets it loop again. Until the real video is in `public/demo/` (or DEMO_SRC
// points to where it is hosted), a placeholder shows instead. Reduced motion: no autoplay, no
// slide-ups.

const DEMO_SRC = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL || "/demo/demo.mp4";
const TITLE = "Two minutes with a Mind";
const HOW = [
  ["Pick a Mind", "Choose a personality and give it a name."],
  ["Set your limits", "How much per payment, and which addresses it can pay."],
  ["Stay in charge", "Every payment asks you first. Freeze it any time."],
];

function useInView<T extends Element>(threshold = 0.3) {
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

export function Demo() {
  const [headRef, seen] = useInView<HTMLDivElement>(0.4);
  const video = useRef<HTMLVideoElement>(null);
  const [missing, setMissing] = useState(false);
  const words = TITLE.split(" ");

  // Back to the muted loop when full screen ends.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const onChange = () => {
      const full = document.fullscreenElement === v || (v as unknown as { webkitDisplayingFullscreen?: boolean }).webkitDisplayingFullscreen;
      if (!full) {
        v.muted = true;
        v.controls = false;
        v.loop = true;
        void v.play().catch(() => {});
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    v.addEventListener("webkitendfullscreen", onChange);
    // Plays only while on screen (phones especially): paused once scrolled past.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(([e]) => {
      if (document.fullscreenElement === v) return;
      if (e.isIntersecting && !reduced) void v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.2 });
    io.observe(v);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      v.removeEventListener("webkitendfullscreen", onChange);
      io.disconnect();
    };
  }, []);

  const open = async () => {
    const v = video.current;
    if (!v || missing) return;
    v.currentTime = 0;
    v.muted = false;
    v.loop = false;
    v.controls = true;
    try {
      if (v.requestFullscreen) await v.requestFullscreen();
      else (v as unknown as { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.(); // iPhone
    } catch {
      /* full screen refused: it still plays with sound in place */
    }
    void v.play().catch(() => {});
  };

  return (
    // A light sheet with big rounded top corners, pulled up over the end of the night section.
    <div className="relative z-20 -mt-16 rounded-t-[40px] bg-[var(--color-bg)] md:-mt-24 md:rounded-t-[72px]">
    <section id="demo" className="mx-auto flex max-w-[1200px] flex-col gap-10 px-5 py-24">
      <div ref={headRef} className="flex flex-col items-center gap-3 text-center">
        <h2 className="max-w-[760px] text-[36px] font-medium leading-[1.08] tracking-[-1.2px] md:text-[48px]" aria-label={TITLE}>
          {words.map((w, i) => (
            <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden="true">
              <span className={`inline-block ${seen ? "word-up" : "translate-y-full"}`} style={{ animationDelay: `${i * 70}ms` }}>
                {w}
              </span>
              {i < words.length - 1 && "\u00A0"}
            </span>
          ))}
        </h2>
      </div>

      <button
        type="button"
        onClick={open}
        aria-label="Play the two-minute demo full screen, with sound"
        className={`group relative aspect-video max-h-[600px] w-full overflow-hidden rounded-[24px] bg-[#161614] ${seen ? "fade-in" : "opacity-0"}`}
        style={{ animationDelay: `${words.length * 70 + 150}ms` }}
      >
        {!missing && (
          <video
            ref={video}
            src={DEMO_SRC}
            muted
            loop
            playsInline
            preload="none"
            onError={() => setMissing(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {missing && (
          <span className="absolute inset-0 grid place-items-center text-[13px] text-white/50">Placeholder: the demo video goes in public/demo/demo.mp4</span>
        )}
        {/* "Sound on" hint: the video is playing silently; a click opens it full screen with sound */}
        <span className="btn-swipe btn-swipe-group absolute bottom-5 left-5 flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-[14px] font-medium text-white backdrop-blur-md">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 4.5v15l13-7.5z" />
          </svg>
          Watch with sound
        </span>
      </button>

      <div className="grid gap-5 md:grid-cols-3">
        {HOW.map(([t, d], k) => (
          <div
            key={t}
            className={`flex items-start gap-3.5 ${seen ? "rise-in" : "opacity-0"}`}
            style={{ animationDelay: `${words.length * 70 + 300 + k * 110}ms` }}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[13px] font-semibold text-[var(--color-on-accent)]">{k + 1}</span>
            <div className="text-left">
              <h3 className="text-[17px] font-medium">{t}</h3>
              <p className="text-[15px] leading-[1.45] text-[var(--color-text-2)]">{d}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
    </div>
  );
}
