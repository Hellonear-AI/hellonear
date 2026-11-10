"use client";

import { useEffect, useRef, useState } from "react";

// "Watch your Mind think": an Obsidian-style graph of a Mind (Penny) with its skills, tools, apps,
// memory and wallet, the same nodes as the app's live view. Nodes float gently, can be dragged and
// spring back; hovering a node lights its neighbours and dims the rest. While the section is in view,
// Penny's run plays: the nodes it uses light up in order with particles along the edges, and the
// step list beside it ticks along. Reduced motion: still graph, all steps shown.

type Kind = "mind" | "skill" | "tool" | "app" | "wallet" | "memory";
type Node = { id: string; label: string; kind: Kind; x: number; y: number; icon?: string };

const COLORS: Record<Kind, string> = {
  mind: "#F2F1EC",
  skill: "#D8F04A",
  tool: "#4C7DF0",
  app: "#2A2A27",
  wallet: "#F0A93C",
  memory: "#2EC4A6",
};
const SIZE: Record<Kind, number> = { mind: 30, skill: 11, tool: 7, app: 13, wallet: 15, memory: 10 };

// Laid out on a 1000 x 640 canvas around Penny.
const NODES: Node[] = [
  { id: "penny", label: "Penny", kind: "mind", x: 500, y: 320 },
  { id: "planner", label: "Daily planner", kind: "skill", x: 430, y: 150 },
  { id: "calendar", label: "Google Calendar", kind: "app", x: 560, y: 95, icon: "/brands/google-calendar.png" },
  { id: "meet", label: "Google Meet", kind: "app", x: 300, y: 92 },
  { id: "calc", label: "Calculator", kind: "tool", x: 455, y: 55 },
  { id: "emailhelper", label: "Email helper", kind: "skill", x: 290, y: 245 },
  { id: "gmail", label: "Gmail", kind: "app", x: 230, y: 160, icon: "/brands/gmail.svg" },
  { id: "memory", label: "Memory", kind: "memory", x: 350, y: 330 },
  { id: "emailaddr", label: "Email address", kind: "skill", x: 260, y: 420 },
  { id: "mymail", label: "Penny's email", kind: "app", x: 130, y: 380 },
  { id: "nearlookup", label: "NEAR account lookup", kind: "skill", x: 360, y: 520 },
  { id: "payments", label: "Payments", kind: "skill", x: 600, y: 470 },
  { id: "clock", label: "Clock", kind: "tool", x: 470, y: 585 },
  { id: "wallet", label: "Wallet", kind: "wallet", x: 625, y: 590 },
  { id: "nearview", label: "NEAR lookup", kind: "tool", x: 760, y: 360 },
  { id: "check", label: "Limit check", kind: "tool", x: 495, y: 430 },
  { id: "otherapps", label: "Other apps", kind: "skill", x: 700, y: 300 },
  { id: "web", label: "Websites", kind: "tool", x: 860, y: 260 },
  { id: "walletwatch", label: "Wallet watch", kind: "skill", x: 640, y: 200 },
  { id: "search", label: "Skill search", kind: "tool", x: 520, y: 220 },
];
const EDGES: [string, string][] = [
  ["penny", "planner"], ["planner", "calendar"], ["planner", "meet"], ["planner", "calc"],
  ["penny", "emailhelper"], ["emailhelper", "gmail"], ["penny", "memory"],
  ["penny", "emailaddr"], ["emailaddr", "mymail"], ["penny", "nearlookup"],
  ["penny", "payments"], ["payments", "clock"], ["payments", "wallet"], ["payments", "nearview"], ["payments", "check"],
  ["penny", "otherapps"], ["otherapps", "web"], ["penny", "walletwatch"], ["penny", "search"],
];

// Penny's run: which edge carries the step, and the line in the list.
const RUN: { edge: [string, string]; text: string; wait?: boolean }[] = [
  { edge: ["penny", "payments"], text: "Understood: pay the internet bill" },
  { edge: ["payments", "check"], text: "Checked your limits: allowed" },
  { edge: ["payments", "wallet"], text: "Asked you first: you approved", wait: true },
  { edge: ["payments", "wallet"], text: "Paid 1.5 NEAR to Biznet" },
  { edge: ["penny", "memory"], text: "Remembered: internet is paid monthly" },
];
const STEP_MS = 1500;

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
const neighbours = (id: string) =>
  new Set(EDGES.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : [])).concat(id));

function Check() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function MindGraph() {
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [step, setStep] = useState(-1); // index into RUN, -1 = idle
  const pos = useRef(Object.fromEntries(NODES.map((n) => [n.id, { x: n.x, y: n.y, vx: 0, vy: 0 }])));
  const drag = useRef<string | null>(null);

  // Float, spring back after a drag, and redraw (positions written straight to the SVG).
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    const t0 = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const t = (now - t0) / 1000;
      for (const [i, n] of NODES.entries()) {
        const p = pos.current[n.id];
        if (drag.current === n.id) continue;
        const ax = n.x + (reduced || n.kind === "mind" ? 0 : Math.sin(t * 0.6 + i * 1.7) * 6);
        const ay = n.y + (reduced || n.kind === "mind" ? 0 : Math.cos(t * 0.5 + i * 2.3) * 6);
        p.vx = (p.vx + (ax - p.x) * 0.06) * 0.82;
        p.vy = (p.vy + (ay - p.y) * 0.06) * 0.82;
        p.x += p.vx;
        p.y += p.vy;
      }
      for (const g of el.querySelectorAll<SVGGElement>("[data-node]")) {
        const p = pos.current[g.dataset.node!];
        g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      }
      for (const path of el.querySelectorAll<SVGPathElement>("[data-edge]")) {
        const [a, b] = path.dataset.edge!.split(">");
        const p = pos.current[a];
        const q = pos.current[b];
        const mx = (p.x + q.x) / 2 + (q.y - p.y) * 0.12;
        const my = (p.y + q.y) / 2 - (q.x - p.x) * 0.12;
        path.setAttribute("d", `M${p.x},${p.y} Q${mx},${my} ${q.x},${q.y}`);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  // Play Penny's run while the graph is in view, then start again.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(RUN.length - 1);
      return;
    }
    let timer = 0;
    let i = -1;
    const next = () => {
      i = i + 1 > RUN.length + 1 ? -1 : i + 1; // two beats of rest after the last step
      setStep(i > RUN.length - 1 ? RUN.length - 1 : i);
      timer = window.setTimeout(next, i === -1 ? 900 : STEP_MS);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        window.clearTimeout(timer);
        if (e.isIntersecting) {
          i = -1;
          next();
        } else setStep(-1);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  // Dragging a node (it springs back on release).
  const toCanvas = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 1000, y: ((e.clientY - r.top) / r.height) * 640 };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const c = toCanvas(e);
    const p = pos.current[drag.current];
    p.x = c.x;
    p.y = c.y;
  };

  const focus = hover ? neighbours(hover) : null;
  const active = step >= 0 ? RUN[step] : null;
  const lit = new Set<string>(RUN.slice(0, step + 1).flatMap((r) => r.edge));
  const isActiveEdge = (a: string, b: string) =>
    !!active && ((active.edge[0] === a && active.edge[1] === b) || (active.edge[0] === b && active.edge[1] === a));

  return (
    <div ref={wrap} className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.02]">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: "radial-gradient(60% 70% at 50% 50%, rgb(216 240 74 / 0.08), transparent 70%)" }}
        aria-hidden="true"
      />
      <svg
        ref={svg}
        viewBox="0 0 1000 640"
        className="relative block h-auto w-full touch-none select-none"
        role="img"
        aria-label="Penny's graph: its skills, tools, apps, memory and wallet. Nodes light up as Penny pays a bill."
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => {
          drag.current = null;
          setHover(null);
        }}
      >
        <defs>
          <filter id="mg-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        {EDGES.map(([a, b]) => {
          const on = isActiveEdge(a, b);
          const dim = focus && !(focus.has(a) && focus.has(b));
          return (
            <g key={`${a}>${b}`}>
              <path
                data-edge={`${a}>${b}`}
                fill="none"
                stroke={on ? "#D8F04A" : lit.has(a) && lit.has(b) ? "rgb(216 240 74 / 0.45)" : "rgb(242 241 236 / 0.16)"}
                strokeWidth={on ? 2.2 : 1.2}
                style={{ opacity: dim ? 0.15 : 1, transition: "opacity 200ms ease, stroke 300ms ease" }}
              />
              {on && (
                <circle r="4" fill="#F2F1EC">
                  <animateMotion dur={`${STEP_MS / 1000}s`} repeatCount="indefinite" keyPoints={a === active!.edge[0] ? "0;1" : "1;0"} keyTimes="0;1" calcMode="linear">
                    <mpath href={`#mg-path-${a}-${b}`} />
                  </animateMotion>
                </circle>
              )}
            </g>
          );
        })}
        {/* ids for the particles' paths (same d as above, kept in sync by the loop through data-edge) */}
        {EDGES.map(([a, b]) => (
          <path key={`id-${a}-${b}`} id={`mg-path-${a}-${b}`} data-edge={`${a}>${b}`} fill="none" stroke="none" />
        ))}
        {NODES.map((n) => {
          const r = SIZE[n.kind];
          const on = lit.has(n.id) || (n.id === "penny" && step >= 0);
          const dim = focus && !focus.has(n.id);
          const waiting = active?.wait && n.id === "penny";
          return (
            <g
              key={n.id}
              data-node={n.id}
              transform={`translate(${n.x} ${n.y})`}
              className="cursor-grab active:cursor-grabbing"
              style={{ opacity: dim ? 0.2 : 1, transition: "opacity 200ms ease" }}
              onPointerEnter={() => setHover(n.id)}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                drag.current = n.id;
              }}
            >
              {on && <circle r={r + 8} fill={n.kind === "app" ? "#D8F04A" : COLORS[n.kind]} opacity="0.55" filter="url(#mg-glow)" />}
              {n.kind === "mind" ? (
                <>
                  <circle r={r + 3} fill="none" stroke={waiting ? "#F0A93C" : "rgb(242 241 236 / 0.5)"} strokeWidth="2">
                    {waiting && <animate attributeName="r" values={`${r + 3};${r + 9};${r + 3}`} dur="1s" repeatCount="indefinite" />}
                  </circle>
                  <clipPath id="mg-penny">
                    <circle r={r} />
                  </clipPath>
                  <circle r={r} fill="#F2F1EC" />
                  <image href="/minds/payments-mind.webp" x={-r * 1.6} y={-r * 1.15} width={r * 3.2} height={r * 3.5} clipPath="url(#mg-penny)" />
                </>
              ) : n.kind === "app" ? (
                <>
                  <circle r={r} fill={COLORS.app} stroke="rgb(242 241 236 / 0.35)" strokeWidth="1.5" />
                  {n.icon ? (
                    <image href={n.icon} x={-r * 0.6} y={-r * 0.6} width={r * 1.2} height={r * 1.2} />
                  ) : (
                    <circle r={r * 0.38} fill={n.id === "mymail" ? "#9B6CF0" : "#F2F1EC"} />
                  )}
                </>
              ) : (
                <circle r={r} fill={COLORS[n.kind]} />
              )}
              <text
                y={r + 18}
                textAnchor="middle"
                fontSize={n.kind === "mind" ? 17 : 13}
                fontWeight={n.kind === "mind" ? 600 : 500}
                fill={n.kind === "mind" ? "#F2F1EC" : "rgb(242 241 236 / 0.72)"}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Penny's steps, ticking along with the graph */}
      <div className="glass-dark absolute bottom-5 right-5 w-[300px] rounded-[20px] p-5 max-md:static max-md:m-4 max-md:w-auto">
        <p className="mb-3 text-[14px] font-medium text-[#F2F1EC]">What Penny just did</p>
        <ol className="flex flex-col gap-2.5">
          {RUN.map((r, i) => {
            const done = i < step || (i === step && !r.wait);
            const now = i === step;
            return (
              <li
                key={r.text}
                className="flex items-center gap-2.5 text-[13.5px] transition-opacity duration-300"
                style={{ opacity: i <= step ? 1 : 0.32, color: "#F2F1EC" }}
              >
                <span
                  className="grid size-5 shrink-0 place-items-center rounded-full"
                  style={{
                    background: now && r.wait ? "rgb(240 169 60 / 0.2)" : done ? "rgb(216 240 74 / 0.18)" : "rgb(242 241 236 / 0.08)",
                    color: now && r.wait ? "#F0A93C" : "#D8F04A",
                  }}
                >
                  {done ? <Check /> : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                {r.text}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
