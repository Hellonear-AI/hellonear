// The landing sections under the hero, following "Landing v0.2" in design/landing.pen.
// First pass so the layout can be judged in the browser; visuals marked "placeholder" come later.

import { MindGraph } from "./MindGraph";

export const Icon = {
  ban: "M4.9 4.9l14.2 14.2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  list: "M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13",
  snow: "M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  mail: "M4 4h16v16H4zM4 6l8 7 8-7",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  hourglass: "M6 2h12M6 22h12M6 2c0 6 12 6 12 10S6 16 6 22M18 2c0 6-12 6-12 10s12 4 12 10",
  play: "M7 4.5v15l13-7.5z",
  arrow: "M5 12h14M12 5l7 7-7 7",
  github: "M9 19c-4 1.5-4-2-6-2.5m12 5V18a3.4 3.4 0 0 0-1-2.6c3.2-.4 6.5-1.6 6.5-7a5.4 5.4 0 0 0-1.5-3.8 5 5 0 0 0-.1-3.8s-1.2-.4-3.9 1.5a13.4 13.4 0 0 0-7 0C6.3.4 5.1.8 5.1.8a5 5 0 0 0-.1 3.8A5.4 5.4 0 0 0 3.5 8.4c0 5.4 3.3 6.6 6.5 7a3.4 3.4 0 0 0-1 2.6V22",
};

export function I({ d, size = 16, className = "" }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Heading({ title, sub, align = "center" }: { title: string; sub?: string; align?: "center" | "left" }) {
  return (
    <div className={`flex flex-col gap-3 ${align === "center" ? "items-center text-center" : "items-start"}`}>
      <h2 className="max-w-[760px] text-[36px] font-medium leading-[1.08] tracking-[-1.2px] md:text-[48px]">{title}</h2>
      {sub && <p className="max-w-[600px] text-[17px] leading-[1.5] text-[var(--color-text-2)]">{sub}</p>}
    </div>
  );
}

const MINDS = [
  { img: "general-assistant", name: "General Assistant", role: "Your everyday helper", quote: "I remember the small stuff so you don't have to.", bg: "var(--color-info-soft)" },
  { img: "payments-mind", name: "Payments Mind", role: "Pays your bills, inside your limits", quote: "I keep your bills paid and your limits boring.", bg: "var(--color-accent-soft)" },
  { img: "email-manager", name: "Email Manager", role: "Keeps your inbox calm", quote: "I read the noise so you only see what matters.", bg: "var(--color-warning-soft)" },
];

export function Point({ d, children, className = "" }: { d: string; children: React.ReactNode; className?: string }) {
  return (
    <li className={`flex items-center gap-3 ${className}`}>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-surface)]">
        <I d={d} />
      </span>
      <span className="text-[15px] font-medium leading-[1.4]">{children}</span>
    </li>
  );
}

export function ApprovalVisual() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[24px] bg-[var(--color-surface-muted)] p-8 md:p-12">
      <div className="flex w-full max-w-[420px] flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="size-6 rounded-full bg-[var(--color-accent-soft)] bg-cover" style={{ backgroundImage: "url(/minds/payments-mind.webp)" }} />
          <span className="text-[13px] font-semibold">Penny</span>
        </div>
        <p className="rounded-[4px_18px_18px_18px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-[15px] leading-[1.45]">
          Biznet sent your internet bill. I&apos;ve got it ready, it just needs your OK.
        </p>
      </div>
      <div className="flex w-full max-w-[420px] flex-col gap-4 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_12px_32px_rgb(22_22_20/0.07)]">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-[var(--color-text-2)]">Penny wants to send</span>
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--color-warning-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-warning)]">
            <I d={Icon.hourglass} size={13} /> Needs approval
          </span>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-[44px] font-medium leading-none tracking-[-1.5px]">1.5</span>
          <span className="text-[16px] font-medium text-[var(--color-text-2)]">NEAR</span>
        </div>
        <div className="flex items-center gap-2.5 text-[14px]">
          <span className="text-[var(--color-text-2)]">to</span>
          <span className="rounded-[8px] bg-[var(--color-surface-muted)] px-3 py-1.5 font-mono">biznet.testnet</span>
        </div>
        <p className="text-[14px] text-[var(--color-text-2)]">Within your 2 NEAR limit, to an address on your list.</p>
        <div className="flex justify-end gap-2">
          <button className="rounded-full border border-[var(--color-border-strong)] px-5 py-2.5 text-[14px] font-medium">Decline</button>
          <button className="flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-[14px] font-medium text-[var(--color-on-primary)]">
            <I d={Icon.check} /> Approve
          </button>
        </div>
      </div>
    </div>
  );
}

/** The approval scene: a high-angle shot of a sunny lawn with the Mind lying on it (one generated
    image, upscaled with Real-ESRGAN), and the approval UI on frosted glass lying on the lawn in the
    same perspective. A fine film grain on top hides what is left of the generated look. */
export function ApprovalScene() {
  return (
    // A fixed-size stage (1680 x 722, the photo's aspect): the photo and everything on it are laid out
    // once in these units and only ever scaled and moved together (ApprovalsScroll), like a real print.
    <div className="ap-stage absolute left-0 top-0 h-[722px] w-[1680px] origin-top-left will-change-transform">
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/scenes/approval-scene.webp" alt="The Payments Mind lying on a sunny lawn, glancing at the approval card" className="absolute inset-0 h-full w-full" />

        {/* No outer card: Penny's bubble and the approval card float on their own, close together,
            lying on the lawn in its perspective. Each is light frosted glass with its own shadow. */}
        <div className="ap-float absolute left-[84px] top-[144px] w-[420px] [perspective:1400px]">
          <div className="flex flex-col gap-2.5 [transform:rotateX(22deg)_rotateZ(12deg)] [transform-style:preserve-3d]">
            <div className="flex items-center gap-2 pl-1">
              <span className="relative size-7 shrink-0 overflow-hidden rounded-full bg-white/80 shadow-[18px_45px_10px_rgb(0_0_0/0.45)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/minds/payments-mind.webp" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-contain p-0.5" />
              </span>
              <span className="text-[14px] font-semibold text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.4)]">Penny</span>
            </div>
            <p className="glass-float rounded-[4px_18px_18px_18px] px-4 py-3 text-[14px] leading-[1.4]">
              Biznet sent your internet bill. I&apos;ve got it ready, it just needs your OK.
            </p>
            <div className="glass-float flex flex-col gap-3 rounded-[20px] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-[var(--color-text)]/70">Penny wants to send</span>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-warning-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-warning)]">
                  <I d={Icon.hourglass} size={12} /> Needs approval
                </span>
              </div>
              <div className="flex items-end gap-1.5">
                <span className="text-[40px] font-medium leading-none tracking-[-1.5px]">1.5</span>
                <span className="text-[15px] font-medium text-[var(--color-text)]/70">NEAR</span>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-[var(--color-text)]/70">to</span>
                <span className="rounded-[8px] bg-white/70 px-2.5 py-1 font-mono">biznet.testnet</span>
              </div>
              <p className="text-[12.5px] leading-[1.4] text-[var(--color-text)]/70">Within your 2 NEAR limit, to an address on your list.</p>
              <div className="flex justify-end gap-2">
                <span className="rounded-full border border-white/70 bg-white/60 px-4 py-2 text-[13px] font-medium">Decline</span>
                <span className="ap-approve flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-4 py-2 text-[13px] font-medium text-[var(--color-on-primary)]">
                  <I d={Icon.check} size={14} /> Approve
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* "Tricked?": on the open lawn in the right part of the same photo. It is part of the picture,
            so it slides in with the photo when the camera tracks right (see ApprovalsScroll). */}
        <div className="ap-tricked absolute left-[860px] top-[123px] flex w-[680px] flex-col gap-6">
          <div className="flex flex-col gap-2 text-white [text-shadow:0_2px_18px_rgb(10_30_5/0.55)]">
            <h2 id="safety" className="text-[48px] font-medium leading-[1.04] tracking-[-1.6px]">
              Tricked? Still can&apos;t spend it.
            </h2>
            <p className="max-w-[520px] text-[16px] leading-[1.5] text-white/90">
              AI can be fooled, so your limits live outside of it. A trick has to get past you, then past the wallet.
            </p>
          </div>
          <div className="grid grid-cols-2 items-stretch gap-5">
            {/* Layer 1: you see it and say no */}
            <div className="glass-float flex flex-col gap-3 rounded-[20px] p-4">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-[var(--color-primary)] text-[12px] font-semibold text-[var(--color-on-primary)]">1</span>
                <span className="text-[15px] font-medium">You see it and say no</span>
              </div>
              <div className="flex items-start gap-2 rounded-[12px] bg-white/60 px-3 py-2 text-[12.5px]">
                <I d={Icon.mail} size={14} className="mt-0.5 shrink-0 text-[var(--color-text-2)]" />
                <span>
                  <b className="font-semibold">Urgent: your internet will be cut</b>
                  <br />
                  <span className="text-[var(--color-text-2)]">Pay 9 NEAR to pay-biznet.testnet today.</span>
                </span>
              </div>
              <div className="flex flex-col gap-2 rounded-[12px] bg-white/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium">9 NEAR to pay-biznet.testnet</span>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-danger-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-danger)]">
                    <I d={Icon.alert} size={11} /> Looks suspicious
                  </span>
                </div>
                <p className="text-[11.5px] text-[var(--color-text-2)]">Not on your address list. The request came from an email.</p>
                <span className="flex w-fit items-center gap-1 self-end rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-on-primary)]">
                  <I d={Icon.x} size={12} /> Decline
                </span>
              </div>
            </div>
            {/* Layer 2: approved by mistake, still no */}
            <div className="glass-float flex flex-col gap-3 rounded-[20px] p-4">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-[var(--color-primary)] text-[12px] font-semibold text-[var(--color-on-primary)]">2</span>
                <span className="text-[15px] font-medium">Approved by mistake? Still no</span>
              </div>
              <div className="flex flex-col gap-2.5 rounded-[12px] bg-white/70 p-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
                    <I d={Icon.lock} size={14} />
                  </span>
                  <span className="leading-tight">
                    <b className="text-[13px] font-semibold">Blocked before signing</b>
                    <br />
                    <span className="text-[11.5px] text-[var(--color-text-2)]">9 NEAR to pay-biznet.testnet</span>
                  </span>
                </div>
                {["Not on your address list", "No transaction was made", "Your balance didn't change"].map((t) => (
                  <span key={t} className="flex items-center gap-2 text-[12px]">
                    <I d={Icon.check} size={12} className="text-[var(--color-text-2)]" /> {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function Layer({ n, title, sub, children }: { n: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 rounded-[24px] bg-[var(--color-surface)] p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-7 place-items-center rounded-full bg-[var(--color-primary)] text-[13px] font-semibold text-[var(--color-on-primary)]">{n}</span>
        <h3 className="text-[20px] font-medium">{title}</h3>
      </div>
      <p className="text-[15px] leading-[1.45] text-[var(--color-text-2)]">{sub}</p>
      <div className="flex flex-1 flex-col gap-3 rounded-[16px] bg-[var(--color-surface-muted)] p-6">{children}</div>
    </div>
  );
}

export function Safety() {
  return (
    <section id="safety-mobile" className="mx-auto flex max-w-[1200px] flex-col gap-12 px-5 py-24">
      <Heading
        title="Tricked? Still can't spend it."
        sub="AI can be fooled, so your limits live outside of it. A trick has to get past you, then past the wallet."
      />
      <div className="grid gap-5 md:grid-cols-2">
        <Layer n={1} title="You see it and say no" sub="A tricky email asks Penny to pay. Penny can't pay on its own, so it asks you, and flags what looks wrong.">
          <div className="flex items-start gap-2.5 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3">
            <I d={Icon.mail} className="mt-0.5 text-[var(--color-text-2)]" />
            <div className="text-[14px]">
              <p className="font-semibold">Urgent: your internet will be cut</p>
              <p className="text-[var(--color-text-2)]">Pay 9 NEAR to pay-biznet.testnet today to keep it on.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-medium">9 NEAR to pay-biznet.testnet</span>
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--color-danger-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-danger)]">
                <I d={Icon.alert} size={13} /> Looks suspicious
              </span>
            </div>
            <p className="text-[13px] text-[var(--color-text-2)]">Not on your address list. The request came from an email.</p>
            <div className="flex justify-end">
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-4 py-2 text-[13px] font-medium text-[var(--color-on-primary)]">
                <I d={Icon.x} size={14} /> Decline
              </span>
            </div>
          </div>
        </Layer>
        <Layer n={2} title="Approved by mistake? Still no" sub="If you approve anyway, the wallet checks your limits before it signs. Off the list or over the limit means no payment.">
          <div className="flex flex-col gap-3.5 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
                <I d={Icon.lock} />
              </span>
              <div>
                <p className="text-[15px] font-semibold">Blocked before signing</p>
                <p className="text-[13px] text-[var(--color-text-2)]">9 NEAR to pay-biznet.testnet</p>
              </div>
            </div>
            {["Not on your address list", "No transaction was made", "Your balance didn't change"].map((t) => (
              <p key={t} className="flex items-center gap-2.5 text-[14px]">
                <I d={Icon.check} size={15} className="text-[var(--color-text-2)]" /> {t}
              </p>
            ))}
          </div>
        </Layer>
      </div>
    </section>
  );
}

export function SeeInside() {
  return (
    <section id="skills" className="mx-auto flex max-w-[1200px] flex-col gap-12 px-5 py-24">
      <Heading
        align="left"
        title="Watch your Mind think"
        sub="Every skill, tool and app your Mind can use, in one map. What it touches lights up as it works, so if something looks off, you see it right away."
      />
      <MindGraph />
    </section>
  );
}

const HOW = [
  ["Pick a Mind", "Choose a personality and give it a name."],
  ["Set your limits", "How much per payment, and which addresses it can pay."],
  ["Stay in charge", "Every payment asks you first. Freeze it any time."],
];

export function Demo() {
  return (
    <section id="demo" className="mx-auto flex max-w-[1200px] flex-col gap-10 px-5 py-24">
      <Heading title="Two minutes with a Mind" />
      <div className="grid aspect-video max-h-[540px] w-full place-items-center rounded-[24px] border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)]">
        <div className="flex flex-col items-center gap-3 text-[var(--color-text-3)]">
          <span className="grid size-16 place-items-center rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={Icon.play} /></svg>
          </span>
          <span className="text-[13px]">Placeholder: demo video (2 min)</span>
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {HOW.map(([t, d], k) => (
          <div key={t} className="flex items-start gap-3.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[13px] font-semibold text-[var(--color-on-accent)]">{k + 1}</span>
            <div>
              <h3 className="text-[17px] font-medium">{t}</h3>
              <p className="text-[15px] leading-[1.45] text-[var(--color-text-2)]">{d}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 pb-24">
      <div className="relative flex flex-col gap-6 overflow-hidden rounded-[32px] bg-[var(--color-primary)] p-10 text-[var(--color-on-primary)] md:flex-row md:items-center md:justify-between md:p-14">
        <div className="flex flex-col gap-3">
          <h2 className="text-[34px] font-medium leading-[1.08] tracking-[-1px] md:text-[44px]">Ready to meet your Mind?</h2>
          <p className="text-[17px] text-white/70">Free to try on NEAR testnet. No real money involved.</p>
          <div className="mt-2 flex flex-wrap gap-2.5">
            <a href="#top" className="hero-btn bg-[var(--color-accent)] text-[var(--color-on-accent)]">
              Meet your Mind <I d={Icon.arrow} size={15} />
            </a>
            <a href="https://github.com/Hellonear-AI/hellonear" className="hero-btn border border-white/25 text-white">
              <I d={Icon.github} size={15} /> View on GitHub
            </a>
          </div>
        </div>
        <div className="flex gap-3">
          {MINDS.map((m) => (
            <span key={m.img} className="size-24 rounded-[20px] bg-cover bg-center" style={{ backgroundColor: m.bg, backgroundImage: `url(/minds/${m.img}.webp)` }} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-5 py-14 md:flex-row md:justify-between">
        <div className="flex max-w-[320px] flex-col gap-3">
          <span className="text-[18px] font-semibold">HelloNEAR</span>
          <p className="text-[14px] text-[var(--color-text-2)]">AI helpers with limits they can&apos;t break.</p>
        </div>
        <div className="grid grid-cols-3 gap-12 text-[14px]">
          {[
            ["Product", [["Minds", "#minds"], ["Safety", "#safety"], ["Skills", "#skills"]]],
            ["Project", [["GitHub", "https://github.com/Hellonear-AI/hellonear"], ["Demo video", "#demo"], ["How it works", "#how-it-works"]]],
            ["Follow", [["X", "#"], ["NEAR", "https://near.org"]]],
          ].map(([head, links]) => (
            <div key={head as string} className="flex flex-col gap-2.5">
              <span className="font-medium">{head as string}</span>
              {(links as string[][]).map(([l, h]) => (
                <a key={l} href={h} className="text-[var(--color-text-2)] hover:text-[var(--color-text)]">
                  {l}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
