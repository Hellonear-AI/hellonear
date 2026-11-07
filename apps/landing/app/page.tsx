import Image from "next/image";
import { Nav } from "@/components/Nav";

// Hills from design/landing.pen (frame "Hero v2"), drawn on a 1440 x 900 canvas.
const HILLS = [
  { fill: "#E2DFD3", d: "M0 600c180-80 360-60 520-15 180 50 340-65 520-45 160 16 290 60 400 45l0 315-1440 0z" },
  { fill: "#D5D9C2", d: "M0 655c160-45 300-55 450-25 110 20 190 10 270 6 100-4 200-36 360-21 160 15 270 45 360 35l0 250-1440 0z" },
];
const HILL_FRONT = {
  fill: "#C7CF9C",
  d: "M0 700c140-30 260-38 420-40 100-1 140-10 180-12l240 0c40 2 80 11 180 12 160 2 280 10 420 40l0 200-1440 0z",
};

function Hill({ fill, d }: { fill: string; d: string }) {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMax slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <path fill={fill} d={d} />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <section className="relative h-[900px] overflow-hidden bg-gradient-to-b from-[#F4F3EF] to-[#EAE6DB]">
          <div className="absolute left-1/2 top-[60px] h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#F7F9D6_0%,transparent_70%)]" />
          {HILLS.map((h) => (
            <Hill key={h.fill} {...h} />
          ))}
          <Image
            src="/mind.png"
            alt="A Mind: a charcoal cloud-headed character with a lime sprout"
            width={559}
            height={605}
            priority
            className="absolute left-1/2 top-[249px] w-[559px] -translate-x-1/2"
          />
          <Hill {...HILL_FRONT} />
          <div className="absolute left-1/2 top-[690px] flex w-[760px] max-w-[calc(100%-40px)] -translate-x-1/2 flex-col items-center gap-4 text-center">
            <h1 className="text-[46px] font-medium leading-[1.05] tracking-[-1.6px]">
              A Mind that can&apos;t spend more than you allow.
            </h1>
            <p className="text-[17px] text-[#3B3E2E]">
              An AI helper with its own wallet. You set the limits, it can&apos;t change them.
            </p>
          </div>
        </section>

        {/* Placeholder sections so the nav links and the scroll change can be tried. */}
        {[
          ["minds", "Pick a Mind you'd like around"],
          ["how-it-works", "Four steps, and you stay in charge"],
          ["safety", "Tricked? Still can't spend it."],
          ["skills", "Skills"],
        ].map(([id, title]) => (
          <section key={id} id={id} className="mx-auto flex min-h-[80vh] max-w-[1200px] items-center px-6">
            <h2 className="text-4xl font-medium tracking-tight">{title}</h2>
          </section>
        ))}
      </main>
    </>
  );
}
