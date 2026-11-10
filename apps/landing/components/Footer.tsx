import { Logo } from "./Logo";

// The footer: a meadow with rolling hills and the Mind sitting in the middle, looking at you. The sky
// was cut out of the image, so the hills rise straight from the page. Desktop: the logo, a line and
// the links sit on the grass in white. Phones: they sit on the page above the meadow.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.hellonear.xyz";
const REPO = "https://github.com/Hellonear-AI/hellonear";

const COLUMNS: [string, [string, string][]][] = [
  ["Product", [["Open app", APP_URL], ["Minds", "#minds"], ["How it works", "#how-it-works"], ["Safety", "#safety"], ["Mind Graph", "#skills"]]],
  ["Project", [["GitHub", REPO], ["README", `${REPO}#readme`], ["Demo video", "#demo"]]],
  ["Built on", [["NEAR", "https://near.org"], ["NEAR AI Cloud", "https://cloud.near.ai"], ["Mastra", "https://mastra.ai"]]],
];

export function Footer() {
  return (
    <footer className="relative">
      {/* Phones: the text on the page, above the meadow */}
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-5 pb-6 pt-10 md:hidden">
        <Brand />
        <Links className="text-[var(--color-text-2)]" head="text-[var(--color-text)]" />
      </div>

      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/scenes/footer-meadow.webp"
          alt="The Mind sitting in a green meadow with rolling hills behind it"
          width={3200}
          height={1074}
          loading="lazy"
          className="block h-auto min-h-[380px] w-full object-cover object-bottom md:min-h-[560px]"
        />
        {/* Shade on the grass behind the text (darker low and at the sides, clear around the Mind and
            the hills), so the white text reads on the bright grass. */}
        <div
          className="pointer-events-none absolute inset-0 hidden md:block"
          aria-hidden="true"
          style={{
            background: [
              "radial-gradient(ellipse 22% 38% at 50% 58%, rgb(15 30 8 / 0) 0%, rgb(15 30 8 / 0) 60%, transparent 100%)",
              "linear-gradient(to right, rgb(15 30 8 / 0.42), rgb(15 30 8 / 0.1) 32%, rgb(15 30 8 / 0) 45%, rgb(15 30 8 / 0) 55%, rgb(15 30 8 / 0.1) 66%, rgb(15 30 8 / 0.42))",
            ].join(","),
            WebkitMaskImage: "linear-gradient(to bottom, transparent 34%, #000 58%)",
            maskImage: "linear-gradient(to bottom, transparent 34%, #000 58%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%]"
          aria-hidden="true"
          style={{ background: "linear-gradient(to bottom, transparent, rgb(15 30 8 / 0.45))" }}
        />
        {/* Desktop: the text on the grass */}
        <div className="absolute inset-x-0 bottom-0 top-[42%] hidden md:block">
          <div className="footer-on-grass mx-auto flex h-full max-w-[1200px] items-start justify-between gap-10 px-5 pt-6 text-white">
            <Brand light />
            <Links className="text-white/85" head="text-white" />
          </div>
        </div>
        <p className="footer-on-grass absolute inset-x-0 bottom-5 text-center text-[13px] text-white/85">
          © 2026 HelloNear · Built for the NEAR Hackathon
        </p>
      </div>
    </footer>
  );
}

function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <a href="#top" aria-label="HelloNear, back to the top" className={light ? "footer-logo" : ""}>
        {/* big on desktop, a brand mark rather than a small logo */}
        <Logo className={light ? "h-[clamp(56px,6vw,92px)] w-auto" : "h-[44px] w-auto"} />
      </a>
      <p className={`max-w-[360px] leading-[1.5] ${light ? "text-[17px] text-white/90" : "text-[15px] text-[var(--color-text-2)]"}`}>
        A Mind that can&apos;t spend more than you allow.
      </p>
    </div>
  );
}

function Links({ className, head }: { className: string; head: string }) {
  return (
    <nav aria-label="Footer" className="grid grid-cols-3 gap-10 text-[14px] md:gap-14">
      {COLUMNS.map(([title, links]) => (
        <div key={title} className="flex flex-col gap-2.5">
          <span className={`font-medium ${head}`}>{title}</span>
          {links.map(([label, href]) => (
            <a key={label} href={href} className={`${className} transition-colors hover:text-[var(--color-accent)]`}>
              {label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}
