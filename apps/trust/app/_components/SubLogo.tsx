// A subprocessor's logo above its name, the files the repo already keeps (design/brands, docs/readme). A
// service with no logo file here gets a quiet tile with its initials instead. Dark mode swaps in the white
// versions; NEAR AI's black mark is inverted (it has no white file).
type Logo = { src: string; dark?: string; invert?: boolean; mark?: boolean; wide?: boolean };
const LOGOS: Record<string, Logo> = {
  "NEAR AI Cloud": { src: "near-ai.svg", dark: "near-ai-black.svg", invert: true },
  OutLayer: { src: "outlayer.png" },
  Composio: { src: "composio.svg", dark: "composio-white.svg" },
  AgentMail: { src: "agentmail.svg", dark: "agentmail-white.svg" },
  "NEAR AI Agent Market": { src: "agent-market.svg", mark: true },
  Telegram: { src: "telegram.svg", mark: true },
  "NEAR Intents (1Click)": { src: "near-intents.svg", mark: true },
  "FastNear RPC": { src: "fastnear.png", dark: "fastnear-white.png", wide: true },
  "Phala TEE Attestation Explorer": { src: "phala.png", mark: true },
  Vercel: { src: "vercel.svg", dark: "vercel-white.svg", mark: true },
  Cloudflare: { src: "cloudflare.svg", wide: true },
};

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export function SubLogo({ name }: { name: string }) {
  const l = LOGOS[name];
  if (!l)
    return (
      <span className="sub-logo sub-initials" aria-hidden="true">
        {initials(name)}
      </span>
    );
  const cls = `sub-logo ${l.mark ? "sub-mark" : l.wide ? "sub-wide" : "sub-word"}`;
  return (
    <span className="sub-logo-wrap" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brands/${l.src}`} alt="" className={`${cls} ${l.dark ? "on-light" : ""}`} />
      {l.dark ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/brands/${l.dark}`} alt="" className={`${cls} on-dark ${l.invert ? "invert-dark" : ""}`} />
      ) : null}
    </span>
  );
}
