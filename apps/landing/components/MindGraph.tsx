"use client";

import { useEffect, useRef } from "react";
import { stepSim, syncSim, type Sim } from "./graph/sim";
import type { GraphLink, GraphNode, NodeKind, NodeState } from "./graph/types";

// "Watch your Mind think": the app's Mind Graph (Ancung's live view, apps/fe PR #154), drawn the
// same way on a canvas with the same force layout (graph/sim.ts), zoomed out like Obsidian's graph
// view: Penny's graph in the middle and many other Minds' graphs around it, fading into the night.
// Penny plays a scripted run (paying the internet bill) while in view: dots travel from the Mind to
// the node at work, bubbles pulse blue while running and amber while waiting on the owner, ring
// green when done, and the run leaves a lit trail. The other Minds are quieter: now and then one of
// their tools flickers as if it ran. Bubbles drag elastically and a lime torch lights the lines under
// the cursor. No pan or wheel zoom, so the page scrolls normally. Reduced motion: still.

type Cluster = {
  id: string;
  nodes: GraphNode[];
  links: GraphLink[];
  avatar?: string;
  ox: number;
  oy: number;
  /** 1 for Penny; less for the Minds around, which sit a little back. */
  dim: number;
  sim: Sim;
  parent: Map<string, string>;
  states: Map<string, NodeState>;
  at: Map<string, number>;
  trail: string[];
  running: boolean;
  nextBlink: number;
};

// ---- Penny ----------------------------------------------------------------------------------------

const PENNY_NODES: GraphNode[] = [
  { id: "mind", kind: "mind", label: "Penny", uses: 0 },
  { id: "skill:daily-planner", kind: "skill", label: "Daily planner", uses: 4 },
  { id: "app:googlecalendar", kind: "app", label: "Google Calendar", uses: 3, app: "googlecalendar" },
  { id: "app:googlemeet", kind: "app", label: "Google Meet", uses: 1, app: "googlemeet" },
  { id: "tool:add_numbers", kind: "tool", label: "Calculator", uses: 1 },
  { id: "skill:email-helper", kind: "skill", label: "Email helper", uses: 3 },
  { id: "app:gmail", kind: "app", label: "Gmail", uses: 3, app: "gmail" },
  { id: "skill:email-address", kind: "skill", label: "Email address", uses: 1 },
  { id: "app:mail", kind: "app", label: "Penny's email", uses: 1, app: "mail" },
  { id: "memory", kind: "memory", label: "Memory", uses: 2 },
  { id: "skill:payments", kind: "skill", label: "Payments", uses: 6 },
  { id: "wallet", kind: "wallet", label: "Wallet", uses: 5 },
  { id: "tool:near_view_account", kind: "tool", label: "NEAR lookup", uses: 2 },
  { id: "tool:get_time", kind: "tool", label: "Clock", uses: 2 },
  { id: "skill:near-account-lookup", kind: "skill", label: "NEAR account lookup", uses: 1 },
  { id: "skill:other-apps", kind: "skill", label: "Other apps", uses: 1 },
  { id: "tool:http_request", kind: "tool", label: "Websites", uses: 1 },
  { id: "skill:wallet-watch", kind: "skill", label: "Wallet watch", uses: 2 },
  { id: "tool:skill_search", kind: "tool", label: "Skill search", uses: 1 },
];
const PENNY_CHILDREN: [string, string][] = [
  ["skill:daily-planner", "app:googlecalendar"],
  ["skill:daily-planner", "app:googlemeet"],
  ["skill:daily-planner", "tool:add_numbers"],
  ["skill:email-helper", "app:gmail"],
  ["skill:email-address", "app:mail"],
  ["skill:payments", "wallet"],
  ["skill:payments", "tool:near_view_account"],
  ["skill:payments", "tool:get_time"],
  ["skill:other-apps", "tool:http_request"],
];

// Penny's run: each step sets some node states and adds to the trail.
const RUN: { states: Record<string, NodeState>; trail: string[] }[] = [
  { states: { "skill:payments": "running" }, trail: ["skill:payments"] },
  { states: { "skill:payments": "ok", "tool:near_view_account": "running" }, trail: ["tool:near_view_account"] },
  { states: { "tool:near_view_account": "ok", wallet: "waiting" }, trail: ["wallet"] },
  { states: { wallet: "running" }, trail: [] },
  { states: { wallet: "ok", memory: "ok" }, trail: ["memory"] },
];
const STEP_MS = 1800;

// ---- The Minds around Penny (made up, seeded, so the page is the same every time) ---------------

const SKILLS = ["Daily planner", "Email helper", "Payments", "Wallet watch", "Meeting prep", "Other apps", "Email address", "NEAR account lookup", "Research", "Reminders", "Invoices", "Travel"];
const TOOLS = ["Clock", "Calculator", "Websites", "NEAR lookup", "Skill search", "Notes", "Translate"];
const APPS: { label: string; app: GraphNode["app"] }[] = [
  { label: "Gmail", app: "gmail" },
  { label: "Google Calendar", app: "googlecalendar" },
  { label: "Google Meet", app: "googlemeet" },
];
const NAMES = ["Atlas", "Mira", "Juno", "Otto", "Kiko", "Sora", "Bima", "Lumi", "Nala", "Rio", "Vega", "Tala", "Iris", "Odin"];
const AVATARS = ["/minds/general-assistant.webp", "/minds/email-manager.webp", "/minds/payments-mind.webp"];

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function makeMind(r: () => number, name: string): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [{ id: "mind", kind: "mind", label: name, uses: 0 }];
  const links: GraphLink[] = [];
  const skills = [...SKILLS].sort(() => r() - 0.5).slice(0, 3 + Math.floor(r() * 4));
  skills.forEach((label, i) => {
    const id = `skill:${i}`;
    nodes.push({ id, kind: "skill", label, uses: Math.floor(r() * 6) });
    links.push({ source: "mind", target: id });
    const kids = Math.floor(r() * 3);
    for (let k = 0; k < kids; k++) {
      const kid = `${id}:${k}`;
      if (r() < 0.3) {
        const a = APPS[Math.floor(r() * APPS.length)];
        nodes.push({ id: kid, kind: "app", label: a.label, uses: 1, app: a.app });
      } else if (r() < 0.2) nodes.push({ id: kid, kind: "wallet", label: "Wallet", uses: 2 });
      else nodes.push({ id: kid, kind: "tool", label: TOOLS[Math.floor(r() * TOOLS.length)], uses: Math.floor(r() * 3) });
      links.push({ source: id, target: kid });
    }
  });
  if (r() < 0.7) {
    nodes.push({ id: "memory", kind: "memory", label: "Memory", uses: 1 });
    links.push({ source: "mind", target: "memory" });
  }
  return { nodes, links };
}

function buildWorld(): Cluster[] {
  const mk = (id: string, nodes: GraphNode[], links: GraphLink[], ox: number, oy: number, dim: number, avatar?: string): Cluster => {
    const kinds = new Map(nodes.map((n) => [n.id, n.kind]));
    const sim = syncSim(null, nodes, links, "mind");
    for (let i = 0; i < 500 && stepSim(sim, kinds); i++);
    // centre each graph on its Mind
    const m = sim.bodies.get("mind")!;
    for (const b of sim.bodies.values()) {
      b.x -= m.x;
      b.y -= m.y;
    }
    return { id, nodes, links, avatar, ox, oy, dim, sim, parent: new Map(links.map((l) => [l.target, l.source])), states: new Map(), at: new Map(), trail: [], running: false, nextBlink: 0 };
  };
  const pennyLinks: GraphLink[] = [
    ...PENNY_NODES.filter((n) => n.kind === "skill" || n.kind === "memory" || n.id === "tool:skill_search").map((n) => ({ source: "mind", target: n.id })),
    ...PENNY_CHILDREN.map(([source, target]) => ({ source, target })),
  ];
  const world = [mk("penny", PENNY_NODES, pennyLinks, 0, 0, 1, "/minds/payments-mind.webp")];
  // Rings of Minds around Penny, a little jittered, like a zoomed-out vault.
  const r = rng(42);
  let n = 0;
  for (const [count, dist, dim] of [
    [7, 640, 0.6],
    [12, 1150, 0.42],
    [18, 1700, 0.3],
    [24, 2250, 0.22],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + n * 0.37 + (r() - 0.5) * 0.3;
      const d = dist * (0.92 + r() * 0.16);
      const { nodes, links } = makeMind(r, NAMES[n % NAMES.length]);
      world.push(mk(`m${n}`, nodes, links, Math.cos(a) * d * 1.3, Math.sin(a) * d * 0.8, dim, r() < 0.5 ? AVATARS[n % 3] : undefined));
      n++;
    }
  }
  return world;
}

// Ancung's dark theme (apps/fe globals.css, .dark), on the landing's night.
const C = {
  fg: "#F2F1EC",
  muted: "#A6A39B",
  faint: "#8E8B83",
  line: "rgba(242,241,236,0.22)",
  glow: "#D8F04A",
  surface: "#1A1D2C",
  bg: "#0a0d1c",
  info: "#6E9BFF",
  success: "#46C27A",
  danger: "#FF6A55",
  warning: "#F0B43C",
  mind: "#F2F1EC",
  skill: "#D8F04A",
  tool: "#4C7DF0",
  app: "#9B6CF0",
  wallet: "#F0A93C",
  memory: "#2FB5A3",
  model: "#9A978F",
};
const FILL: Record<NodeKind, keyof typeof C> = { mind: "mind", skill: "skill", tool: "tool", app: "surface", wallet: "wallet", memory: "memory", model: "model", workflow: "model" };
const LOGO: Record<string, string> = { gmail: "/brands/gmail.svg", googlecalendar: "/brands/google-calendar.png", googlemeet: "/brands/google-meet.svg" };
const AFTERGLOW = 1600;

export function MindGraph() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<Cluster[] | null>(null);
  if (!world.current) world.current = buildWorld();

  // Penny's run while in view: rest, play, rest, play again.
  useEffect(() => {
    const el = wrap.current;
    const penny = world.current![0];
    if (!el) return;
    const apply = (i: number) => {
      if (i < 0) {
        penny.states.clear();
        penny.trail = [];
        penny.running = false;
        return;
      }
      const now = performance.now();
      for (const [id, s] of Object.entries(RUN[i].states)) {
        penny.states.set(id, s);
        penny.at.set(id, now);
      }
      penny.trail = [...new Set([...penny.trail, ...RUN[i].trail])];
      penny.running = i < RUN.length - 1;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      RUN.forEach((_, i) => apply(i));
      return;
    }
    let timer = 0;
    let i = -1;
    const next = () => {
      i = i >= RUN.length + 1 ? -1 : i + 1;
      if (i <= RUN.length - 1) apply(i);
      timer = window.setTimeout(next, i === -1 ? 1200 : STEP_MS);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        window.clearTimeout(timer);
        if (e.isIntersecting) {
          i = -1;
          apply(-1);
          timer = window.setTimeout(next, 600);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  // The canvas: Ancung's drawing, for every Mind in the world.
  useEffect(() => {
    const cv = canvas.current;
    const box = wrap.current;
    const W = world.current!;
    if (!cv || !box) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const font = getComputedStyle(document.body).fontFamily;
    const images = new Map<string, HTMLImageElement>();
    const load = (src: string) => {
      if (images.has(src)) return;
      const im = new Image();
      im.src = src;
      images.set(src, im);
    };
    for (const c of W) if (c.avatar) load(c.avatar);
    Object.values(LOGO).forEach(load);
    const kindsOf = W.map((c) => new Map(c.nodes.map((n) => [n.id, n.kind])));

    let size = { w: 0, h: 0, dpr: 1 };
    const view = { x: 0, y: 0, k: 1 };
    let hover: { c: Cluster; id: string } | null = null;
    let torch: { x: number; y: number } | null = null;
    let visible = false;
    let frame = 0;

    // Penny's graph takes about 40% of the width; the rest of the world spills past the edges.
    const fit = () => {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const b of W[0].sim.bodies.values()) {
        x0 = Math.min(x0, b.x - Math.max(b.r, b.lw / 2));
        x1 = Math.max(x1, b.x + Math.max(b.r, b.lw / 2));
        y0 = Math.min(y0, b.y - b.r);
        y1 = Math.max(y1, b.y + b.r + 18);
      }
      view.k = Math.min((size.w * 0.3) / (x1 - x0), (size.h * 0.5) / (y1 - y0));
      view.x = -((x0 + x1) / 2) * view.k;
      view.y = -((y0 + y1) / 2) * view.k;
    };
    const resize = () => {
      const r = box.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size = { w: r.width, h: r.height, dpr };
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      fit();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(box);

    const toWorld = (px: number, py: number) => ({ x: (px - size.w / 2 - view.x) / view.k, y: (py - size.h / 2 - view.y) / view.k });
    const hit = (px: number, py: number) => {
      const p = toWorld(px, py);
      let best: { c: Cluster; id: string } | null = null;
      let bestD = Infinity;
      for (const c of W)
        for (const b of c.sim.bodies.values()) {
          const d = Math.hypot(b.x + c.ox - p.x, b.y + c.oy - p.y);
          if (d < b.r + 6 / view.k && d < bestD) {
            best = { c, id: b.id };
            bestD = d;
          }
        }
      return best;
    };
    const pathTo = (c: Cluster, id: string) => {
      const out = [id];
      let at = id;
      for (let i = 0; i < 6 && at !== "mind"; i++) {
        const p = c.parent.get(at);
        if (!p) break;
        out.unshift(p);
        at = p;
      }
      return out;
    };
    // Is a Mind's graph on screen at all (cheap bounds check, so far ones aren't drawn)?
    const onScreen = (c: Cluster) => {
      const sx = size.w / 2 + view.x + c.ox * view.k;
      const sy = size.h / 2 + view.y + c.oy * view.k;
      const r = 420 * view.k;
      return sx > -r && sx < size.w + r && sy > -r && sy < size.h + r;
    };

    const drawCluster = (c: Cluster, now: number) => {
      const v = view;
      const sim = c.sim;
      ctx.save();
      ctx.translate(c.ox, c.oy);
      const A = c.dim;
      const state = (id: string) => c.states.get(id);
      const since = (id: string) => now - (c.at.get(id) ?? -Infinity);
      const glowing = (id: string) => {
        const s = state(id);
        return s === "running" || s === "waiting" || (s !== undefined && since(id) < AFTERGLOW);
      };
      const stateColor = (id: string) => {
        const s = state(id);
        return s === "running" ? C.info : s === "waiting" ? C.warning : s === "ok" ? C.success : C.danger;
      };
      const trailLinks = new Set<string>();
      for (const id of c.trail) {
        const p = pathTo(c, id);
        for (let i = 0; i < p.length - 1; i++) trailLinks.add(`${p[i]}>${p[i + 1]}`);
      }
      const onTrail = new Set(c.trail);

      // Lines.
      for (const l of c.links) {
        const a = sim.bodies.get(l.source);
        const b = sim.bodies.get(l.target);
        if (!a || !b) continue;
        const on = glowing(l.target);
        const path = trailLinks.has(`${l.source}>${l.target}`);
        ctx.globalAlpha = A * (on ? 0.95 : path ? (c.running ? 0.9 : 0.55) : 1);
        ctx.strokeStyle = on ? stateColor(l.target) : path ? C.info : C.line;
        ctx.lineWidth = (on || path ? 2.2 : 1.1) / v.k;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // The lime torch under the cursor.
      if (torch) {
        const tx = torch.x - c.ox;
        const ty = torch.y - c.oy;
        const reach = 90 / v.k;
        if (Math.abs(tx) < 700 && Math.abs(ty) < 700) {
          const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, reach);
          g.addColorStop(0, C.glow);
          g.addColorStop(1, `${C.glow}00`);
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = g;
          ctx.lineWidth = 2.4 / v.k;
          ctx.shadowColor = C.glow;
          ctx.shadowBlur = 8 * size.dpr;
          ctx.beginPath();
          for (const l of c.links) {
            const a = sim.bodies.get(l.source);
            const b = sim.bodies.get(l.target);
            if (!a || !b) continue;
            const ex = b.x - a.x;
            const ey = b.y - a.y;
            const t = Math.max(0, Math.min(1, ((tx - a.x) * ex + (ty - a.y) * ey) / (ex * ex + ey * ey || 1)));
            if (Math.hypot(tx - (a.x + ex * t), ty - (a.y + ey * t)) > reach) continue;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      if (!still.matches) {
        if (c.running) {
          ctx.fillStyle = C.info;
          for (const id of c.trail) {
            const s = state(id);
            if (s === "running" || s === "waiting") continue;
            const p = pathTo(c, id);
            for (let i = 0; i < p.length - 1; i++) {
              const a = sim.bodies.get(p[i]);
              const b = sim.bodies.get(p[i + 1]);
              if (!a || !b) continue;
              for (let j = 0; j < 2; j++) {
                const q = (now / 1600 + j / 2 + i * 0.23) % 1;
                ctx.globalAlpha = A * 0.7 * Math.sin(q * Math.PI);
                ctx.beginPath();
                ctx.arc(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q, 2 / v.k, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
        for (const n of c.nodes) {
          const s = state(n.id);
          if (s !== "running" && s !== "waiting") continue;
          const p = pathTo(c, n.id);
          ctx.fillStyle = stateColor(n.id);
          for (let i = 0; i < p.length - 1; i++) {
            const a = sim.bodies.get(p[i]);
            const b = sim.bodies.get(p[i + 1]);
            if (!a || !b) continue;
            for (let j = 0; j < 3; j++) {
              const q = (now / (s === "waiting" ? 1800 : 900) + j / 3 + i * 0.17) % 1;
              ctx.globalAlpha = A * Math.sin(q * Math.PI);
              ctx.beginPath();
              ctx.arc(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q, 2.4 / v.k, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      // Bubbles.
      for (const n of c.nodes) {
        const b = sim.bodies.get(n.id);
        if (!b) continue;
        if (glowing(n.id)) {
          const col = stateColor(n.id);
          const s = state(n.id);
          const loop = s === "running" ? (now % 1200) / 1200 : s === "waiting" ? 0.5 + 0.5 * Math.sin(now / 400) : Math.min(1, since(n.id) / 900);
          ctx.fillStyle = col;
          ctx.globalAlpha = A * 0.18 * (s === "running" || s === "waiting" ? 1 : 1 - loop);
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + 9, 0, Math.PI * 2);
          ctx.fill();
          if (!still.matches) {
            ctx.strokeStyle = col;
            ctx.lineWidth = 2 / v.k;
            ctx.globalAlpha = A * 0.8 * (1 - loop);
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r + 3 + loop * 16, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = A;
        if (n.kind === "mind") {
          const img = c.avatar ? images.get(c.avatar) : undefined;
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fillStyle = C.mind;
          ctx.fill();
          ctx.clip();
          if (img?.complete && img.naturalWidth) {
            const s2 = b.r * 2.1; // the whole character, like the app's avatar
            ctx.drawImage(img, b.x - s2 / 2, b.y - s2 / 2 + b.r * 0.12, s2, s2);
          } else {
            ctx.fillStyle = "#2A2D3C";
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r * 0.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          ctx.strokeStyle = C.fg;
          ctx.lineWidth = 2 / v.k;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = C[FILL[n.kind]];
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
          if (n.kind === "app") {
            ctx.strokeStyle = "rgba(242,241,236,0.28)";
            ctx.lineWidth = 1 / v.k;
            ctx.stroke();
            const img = n.app && LOGO[n.app] ? images.get(LOGO[n.app]) : undefined;
            const s2 = b.r * 1.15;
            if (img?.complete && img.naturalWidth) ctx.drawImage(img, b.x - s2 / 2, b.y - s2 / 2, s2, s2);
            else {
              ctx.fillStyle = C.app;
              ctx.beginPath();
              ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        if (onTrail.has(n.id) && n.kind !== "mind" && !glowing(n.id)) {
          ctx.strokeStyle = C.info;
          ctx.lineWidth = 1.6 / v.k;
          ctx.globalAlpha = A * (c.running ? 0.9 : 0.55);
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + 3.5 / v.k, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Labels last, outlined in the night colour so lines never cut through them.
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      for (const n of c.nodes) {
        const b = sim.bodies.get(n.id);
        if (!b) continue;
        const strong = (hover?.c === c && hover.id === n.id) || glowing(n.id);
        // zoomed out like Obsidian: Minds further back show only their name, the furthest none,
        // unless the cursor is on that node
        if (c.dim < 1 && !(hover?.c === c && hover.id === n.id) && (n.kind !== "mind" || c.dim < 0.4)) continue;
        // labels keep a readable size on screen however far the view is zoomed out
        const px = (n.kind === "mind" ? 13 : n.kind === "tool" ? 10.5 : 11.5) / Math.max(0.8, v.k);
        ctx.font = `${n.kind === "mind" || strong ? 600 : 500} ${px}px ${font}`;
        ctx.globalAlpha = A;
        ctx.strokeStyle = C.bg;
        ctx.lineWidth = 4 / Math.max(0.8, v.k);
        const y = b.y + b.r + 5 / v.k;
        ctx.strokeText(n.label, b.x, y);
        ctx.fillStyle = strong || n.kind === "mind" ? C.fg : n.kind === "tool" ? C.faint : C.muted;
        ctx.fillText(n.label, b.x, y);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const draw = (now: number) => {
      const { w, h, dpr } = size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * (w / 2 + view.x), dpr * (h / 2 + view.y));
      W.forEach((c, i) => {
        stepSim(c.sim, kindsOf[i]); // only moves after a drag
        // The other Minds now and then use a tool: a quick blue pulse, then green.
        if (i > 0 && !still.matches && now > c.nextBlink) {
          const pick = c.nodes[1 + Math.floor(Math.random() * (c.nodes.length - 1))];
          if (pick) {
            c.states.set(pick.id, "running");
            c.at.set(pick.id, now);
            window.setTimeout(() => {
              c.states.set(pick.id, "ok");
              c.at.set(pick.id, performance.now());
            }, 900);
          }
          c.nextBlink = now + 2500 + Math.random() * 6000;
        }
        if (onScreen(c)) drawCluster(c, now);
      });
    };

    const loop = (now: number) => {
      if (visible && !document.hidden) draw(now);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    // Drag a bubble (linked ones follow and it springs back); the torch follows the mouse.
    let drag: { c: Cluster; id: string; x: number; y: number; moved: boolean } | null = null;
    const local = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      const p = local(e);
      const h = hit(p.x, p.y);
      if (!h) return;
      drag = { ...h, x: p.x, y: p.y, moved: false };
      cv.setPointerCapture(e.pointerId);
      cv.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (e.pointerType === "mouse") torch = toWorld(p.x, p.y);
      if (!drag) {
        hover = hit(p.x, p.y);
        cv.style.cursor = hover ? "grab" : "default";
        return;
      }
      if (Math.hypot(p.x - drag.x, p.y - drag.y) > 3) drag.moved = true;
      if (!drag.moved) return;
      const b = drag.c.sim.bodies.get(drag.id);
      if (b) {
        const wpt = toWorld(p.x, p.y);
        b.x = wpt.x - drag.c.ox;
        b.y = wpt.y - drag.c.oy;
        b.vx = 0;
        b.vy = 0;
        b.pinned = true;
        drag.c.sim.alpha = Math.max(drag.c.sim.alpha, 0.6);
      }
    };
    const up = () => {
      if (!drag) return;
      const b = drag.c.sim.bodies.get(drag.id);
      if (b && drag.id !== "mind") b.pinned = false;
      drag.c.sim.alpha = Math.max(drag.c.sim.alpha, 0.7);
      drag = null;
      cv.style.cursor = hover ? "grab" : "default";
    };
    const leave = () => {
      torch = null;
      if (!drag) hover = null;
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("pointerleave", leave);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      cv.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    // Full width, no panel: the graphs sit straight on the night and fade out at the edges.
    <div ref={wrap} className="relative h-[clamp(520px,88vh,880px)] w-full">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Penny's Mind Graph among many other Minds: skills, tools, apps, memory and wallets. Penny's nodes light up as it pays a bill."
        className="graph-fade absolute inset-0 size-full touch-pan-y"
      />
    </div>
  );
}
