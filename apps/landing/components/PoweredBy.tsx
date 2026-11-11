// "Powered by" (#99): the services HelloNear really runs on (files in public/brands/powered, from design/brands), as a logo strip that slides sideways in a
// loop. Logos come from each company's own brand kit (sources in design/brands/README.md) and are not
// recoloured. The row is drawn twice so the loop is seamless; it pauses on hover and stands still for
// reduced motion. Logos link nowhere.
// Under it, "Works with": the apps a Mind can use today (the app's Connections list, apps/fe
// data/apps.tsx, plus Telegram), each logo with its name (plain, like the row above), sliding the other way.

import type { ComponentType } from "react";
import {
  GmailLogo,
  GoogleCalendarLogo,
  GoogleDocsLogo,
  GoogleDriveLogo,
  GoogleMeetLogo,
  GoogleSheetsLogo,
  NotionLogo,
  OutlookLogo,
  SlackLogo,
  TelegramLogo,
  ZoomLogo,
} from "./AppLogos";

// h = height in px at desktop size, tuned so the logos look the same size (wide wordmarks lower,
// square marks taller). Google is not here: its brand rules forbid the logo in marketing.
const LOGOS = [
  { file: "near.svg", name: "NEAR", h: 30 },
  { file: "near-ai.svg", name: "NEAR AI", h: 30 },
  { file: "outlayer.webp", name: "OutLayer", h: 30 },
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

const APPS: [ComponentType<{ className?: string }>, string][] = [
  [TelegramLogo, "Telegram"],
  [GmailLogo, "Gmail"],
  [GoogleCalendarLogo, "Google Calendar"],
  [GoogleSheetsLogo, "Google Sheets"],
  [NotionLogo, "Notion"],
  [GoogleMeetLogo, "Google Meet"],
  [SlackLogo, "Slack"],
  [GoogleDocsLogo, "Google Docs"],
  [ZoomLogo, "Zoom"],
  [GoogleDriveLogo, "Google Drive"],
  [OutlookLogo, "Outlook"],
];

function AppRow({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="marquee-row flex shrink-0 items-center gap-14 pr-14 md:gap-20 md:pr-20" aria-hidden={hidden || undefined}>
      {APPS.map(([L, name]) => (
        <li key={name} className="flex h-14 items-center gap-3 whitespace-nowrap text-[17px] font-medium text-[var(--color-text)] md:text-[20px]">
          <L className="size-7 md:size-8" />
          {name}
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
      <p className="mt-6 text-[13px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-3)]">Works with</p>
      <div className="marquee relative w-full overflow-hidden">
        <div className="marquee-track marquee-reverse flex w-max">
          <AppRow />
          <AppRow hidden />
        </div>
      </div>
    </section>
  );
}
