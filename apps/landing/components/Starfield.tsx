// A field of small stars, the same every render (seeded), some twinkling. Used for the night sky at
// the end of the approvals scroll and behind the Mind Graph, so the two read as one sky.

const NIGHT = "#0a0d1c";
export const NIGHT_BG = NIGHT;

function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function Starfield({ count = 140, seed = 7, className = "" }: { count?: number; seed?: number; className?: string }) {
  const r = rand(seed);
  const stars = Array.from({ length: count }, () => {
    const big = r() < 0.12;
    return { x: r() * 100, y: r() * 100, s: big ? 1.6 + r() * 1.4 : 0.8 + r() * 0.9, o: 0.35 + r() * 0.6, tw: r() < 0.35, d: r() * 4 };
  });
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {stars.map((st, i) => (
        <span
          key={i}
          className={`absolute rounded-full bg-white ${st.tw ? "star-twinkle" : ""}`}
          style={{
            left: `${st.x}%`,
            top: `${st.y}%`,
            width: st.s,
            height: st.s,
            opacity: st.o,
            boxShadow: st.s > 1.8 ? `0 0 ${st.s * 3}px rgb(255 255 255 / 0.6)` : undefined,
            animationDelay: `${-st.d}s`,
          }}
        />
      ))}
    </div>
  );
}
