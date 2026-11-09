// "Powered by" (#99): the services HelloNear really runs on (files in public/brands/powered, from design/brands), as a logo strip that slides sideways in a
// loop. Logos come from each company's own brand kit (sources in design/brands/README.md) and are not
// recoloured. The row is drawn twice so the loop is seamless; it pauses on hover and stands still for
// reduced motion. Logos link nowhere.

// h = height in px at desktop size, tuned so the logos look the same size (wide wordmarks lower,
// square marks taller). Google is not here: its brand rules forbid the logo in marketing.
const LOGOS = [
  { file: "near.svg", name: "NEAR", h: 30 },
  { file: "near-ai.svg", name: "NEAR AI", h: 30 },
  { file: "outlayer.png", name: "OutLayer", h: 30 },
  { file: "meteor-wallet-mark.svg", name: "Meteor Wallet", h: 44 }, // the mark only: the official wordmark is white
  { file: "zai.svg", name: "Z.ai", h: 44 },
  { file: "qwen.svg", name: "Qwen", h: 36 },
  { file: "mastra.svg", name: "Mastra", h: 34 },
  { file: "composio.svg", name: "Composio", h: 34 },
  { file: "agentmail.svg", name: "AgentMail", h: 34 },
];

function Row({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="marquee-row flex shrink-0 items-center gap-24 pr-24" aria-hidden={hidden || undefined}>
      {LOGOS.map((l) => (
        <li key={l.file} className="flex h-14 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/brands/powered/${l.file}`}
            alt={hidden ? "" : l.name}
            className="marquee-logo w-auto max-w-none"
            style={{ height: `calc(${l.h}px * var(--logo-k, 1))` }}
          />
        </li>
      ))}
    </ul>
  );
}

export function PoweredBy() {
  return (
    <section aria-label="Powered by" className="flex flex-col items-center gap-8 pb-4 pt-16 [--logo-k:0.75] md:[--logo-k:1]">
      <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-3)]">Powered by</p>
      <div className="marquee relative w-full overflow-hidden">
        <div className="marquee-track flex w-max">
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
