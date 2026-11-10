"use client";

import { useEffect, useRef, useState } from "react";
import { stepSim, syncSim, type Sim } from "./graph/sim";
import type { GraphLink, GraphNode, NodeKind, NodeState } from "./graph/types";

// "Watch your Mind think": the app's Mind Graph (Ancung's live view, apps/fe PR #154), drawn the
// same way on a canvas with the same force layout (graph/sim.ts), on the landing's night. Instead
// of live events it plays a scripted run of Penny paying the internet bill, in a loop, while in
// view: dots travel from the Mind to the node at work, bubbles pulse blue while running and amber
// while waiting on the owner, ring green when done, and the run leaves a lit trail. Like the app:
// bubbles drag elastically and a lime torch lights the lines under the cursor. No pan or wheel zoom
// here, so the page scrolls normally. Reduced motion: the finished run, still.

const MIND = "mind:penny";

const NODES: GraphNode[] = [
  { id: MIND, kind: "mind", label: "Penny", uses: 0 },
  { id: "skill:daily-planner", kind: "skill", label: "Daily planner", uses: 4 },
  { id: "app:googlecalendar", kind: "app", label: "Google Calendar", uses: 3, app: "googlecalendar" },
  { id: "app:googlemeet", kind: "app", label: "Google Meet", uses: 1, app: "googlemeet" },
  { id: "tool:add_numbers", kind: "tool", label: "Calculator", uses: 1 },
  { id: "skill:email-helper", kind: "skill", label: "Email helper", uses: 3 },
  { id: "app:gmail", kind: "app", label: "Gmail", uses: 3, app: "gmail" },
  { id: "skill:email-address", kind: "skill", label: "Email address", uses: 1 },
  { id: "app:mail", kind: "app", label: "Penny's email", uses: 1, app: "mail" },
  { id: "memory:penny", kind: "memory", label: "Memory", uses: 2 },
  { id: "skill:payments", kind: "skill", label: "Payments", uses: 6 },
  { id: "wallet:penny", kind: "wallet", label: "Wallet", uses: 5 },
  { id: "tool:near_view_account", kind: "tool", label: "NEAR lookup", uses: 2 },
  { id: "tool:get_time", kind: "tool", label: "Clock", uses: 2 },
  { id: "skill:near-account-lookup", kind: "skill", label: "NEAR account lookup", uses: 1 },
  { id: "skill:other-apps", kind: "skill", label: "Other apps", uses: 1 },
  { id: "tool:http_request", kind: "tool", label: "Websites", uses: 1 },
  { id: "skill:wallet-watch", kind: "skill", label: "Wallet watch", uses: 2 },
  { id: "tool:skill_search", kind: "tool", label: "Skill search", uses: 1 },
];
const LINKS: GraphLink[] = [
  ["skill:daily-planner", "app:googlecalendar"],
  ["skill:daily-planner", "app:googlemeet"],
  ["skill:daily-planner", "tool:add_numbers"],
  ["skill:email-helper", "app:gmail"],
  ["skill:email-address", "app:mail"],
  ["skill:payments", "wallet:penny"],
  ["skill:payments", "tool:near_view_account"],
  ["skill:payments", "tool:get_time"],
  ["skill:other-apps", "tool:http_request"],
].map(([source, target]) => ({ source, target }));
for (const n of NODES) if (n.kind === "skill" || n.kind === "memory" || n.id === "tool:skill_search") LINKS.unshift({ source: MIND, target: n.id });

// Penny's run: each step sets some node states and adds to the trail; the list ticks along.
type Step = { text: string; states: Record<string, NodeState>; trail: string[]; wait?: boolean };
const RUN: Step[] = [
  { text: "Understood: pay the internet bill", states: { "skill:payments": "running" }, trail: ["skill:payments"] },
  { text: "Checked the address: biznet.testnet", states: { "skill:payments": "ok", "tool:near_view_account": "running" }, trail: ["tool:near_view_account"] },
  { text: "Asked you first: waiting for your OK", states: { "tool:near_view_account": "ok", "wallet:penny": "waiting" }, trail: ["wallet:penny"], wait: true },
  { text: "Paid 1.5 NEAR to Biznet", states: { "wallet:penny": "running" }, trail: [] },
  { text: "Remembered: internet is paid monthly", states: { "wallet:penny": "ok", "memory:penny": "ok" }, trail: ["memory:penny"] },
];
const STEP_MS = 1800;

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

function Check() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function MindGraph() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState(-1);
  // What the canvas reads: node states, when each changed, the trail, and whether the run goes on.
  const live = useRef({ states: new Map<string, NodeState>(), at: new Map<string, number>(), trail: [] as string[], running: false });

  // Play the run while in view, rest, and play again.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const apply = (i: number) => {
      const L = live.current;
      if (i < 0) {
        L.states.clear();
        L.trail = [];
        L.running = false;
      } else {
        const now = performance.now();
        for (const [id, s] of Object.entries(RUN[i].states)) {
          L.states.set(id, s);
          L.at.set(id, now);
        }
        L.trail = [...new Set([...L.trail, ...RUN[i].trail])];
        L.running = i < RUN.length - 1;
      }
      setStep(i);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      RUN.forEach((_, i) => apply(i));
      return;
    }
    let timer = 0;
    let i = -1;
    const next = () => {
      i = i >= RUN.length + 1 ? -1 : i + 1; // two beats of rest after the last step
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

  // The canvas: Ancung's drawing, fed by the run above.
  useEffect(() => {
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const font = getComputedStyle(document.body).fontFamily;
    const sim: Sim = syncSim(null, NODES, LINKS, MIND);
    const kinds = new Map(NODES.map((n) => [n.id, n.kind]));
    const images = new Map<string, HTMLImageElement>();
    const load = (k: string, src: string) => {
      const im = new Image();
      im.src = src;
      images.set(k, im);
    };
    load("avatar", "/minds/payments-mind.webp");
    for (const [k, src] of Object.entries(LOGO)) load(`app:${k}`, src);

    let size = { w: 0, h: 0, dpr: 1 };
    const view = { x: 0, y: 0, k: 1 };
    let hover: string | null = null;
    let torch: { x: number; y: number } | null = null;
    let visible = false;
    let frame = 0;

    // Settle the layout before the first frame, so the graph doesn't fly in.
    for (let i = 0; i < 500 && stepSim(sim, kinds); i++);

    const fit = (e: number) => {
      if (!size.w) return;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const b of sim.bodies.values()) {
        x0 = Math.min(x0, b.x - Math.max(b.r, b.lw / 2));
        y0 = Math.min(y0, b.y - b.r);
        x1 = Math.max(x1, b.x + Math.max(b.r, b.lw / 2));
        y1 = Math.max(y1, b.y + b.r + 18);
      }
      // keep clear of the steps panel on the right (desktop)
      const padR = size.w > 760 ? 340 : 0;
      const k = Math.min(1.7, Math.min((size.w - 140 - padR) / (x1 - x0 || 1), (size.h - 100) / (y1 - y0 || 1)));
      view.k += (k - view.k) * e;
      view.x += (-((x0 + x1) / 2) * k - padR / 2 - view.x) * e;
      view.y += (-((y0 + y1) / 2) * k - view.y) * e;
    };
    const resize = () => {
      const r = box.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size = { w: r.width, h: r.height, dpr };
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      fit(1);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(box);

    const toWorld = (px: number, py: number) => ({ x: (px - size.w / 2 - view.x) / view.k, y: (py - size.h / 2 - view.y) / view.k });
    const hit = (px: number, py: number) => {
      const p = toWorld(px, py);
      let best: string | null = null;
      let bestD = Infinity;
      for (const b of sim.bodies.values()) {
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        if (d < b.r + 6 / view.k && d < bestD) {
          best = b.id;
          bestD = d;
        }
      }
      return best;
    };
    const parent = new Map(LINKS.map((l) => [l.target, l.source]));
    const pathTo = (id: string) => {
      const out = [id];
      let at = id;
      for (let i = 0; i < 6 && at !== MIND; i++) {
        const p = parent.get(at);
        if (!p) break;
        out.unshift(p);
        at = p;
      }
      return out;
    };

    const draw = (now: number) => {
      stepSim(sim, kinds); // only moves after a drag
      const L = live.current;
      const { w, h, dpr } = size;
      const v = view;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * (w / 2 + v.x), dpr * (h / 2 + v.y));

      const state = (id: string) => L.states.get(id);
      const since = (id: string) => now - (L.at.get(id) ?? -Infinity);
      const glowing = (id: string) => {
        const s = state(id);
        return s === "running" || s === "waiting" || (s !== undefined && since(id) < AFTERGLOW);
      };
      const stateColor = (id: string) => {
        const s = state(id);
        return s === "running" ? C.info : s === "waiting" ? C.warning : s === "ok" ? C.success : C.danger;
      };
      const trailLinks = new Set<string>();
      for (const id of L.trail) {
        const p = pathTo(id);
        for (let i = 0; i < p.length - 1; i++) trailLinks.add(`${p[i]}>${p[i + 1]}`);
      }
      const onTrail = new Set(L.trail);

      // Lines.
      for (const l of LINKS) {
        const a = sim.bodies.get(l.source);
        const b = sim.bodies.get(l.target);
        if (!a || !b) continue;
        const on = glowing(l.target);
        const path = trailLinks.has(`${l.source}>${l.target}`);
        ctx.globalAlpha = on ? 0.95 : path ? (L.running ? 0.9 : 0.55) : 1;
        ctx.strokeStyle = on ? stateColor(l.target) : path ? C.info : C.line;
        ctx.lineWidth = (on || path ? 2.2 : 1.1) / v.k;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // The lime torch under the cursor.
      if (torch) {
        const reach = 90 / v.k;
        const g = ctx.createRadialGradient(torch.x, torch.y, 0, torch.x, torch.y, reach);
        g.addColorStop(0, C.glow);
        g.addColorStop(1, `${C.glow}00`);
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.4 / v.k;
        ctx.shadowColor = C.glow;
        ctx.shadowBlur = 8 * dpr;
        ctx.beginPath();
        for (const l of LINKS) {
          const a = sim.bodies.get(l.source);
          const b = sim.bodies.get(l.target);
          if (!a || !b) continue;
          const ex = b.x - a.x;
          const ey = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((torch.x - a.x) * ex + (torch.y - a.y) * ey) / (ex * ex + ey * ey || 1)));
          if (Math.hypot(torch.x - (a.x + ex * t), torch.y - (a.y + ey * t)) > reach) continue;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      if (!still.matches) {
        // Slow dots along the trail while the run goes on.
        if (L.running) {
          ctx.fillStyle = C.info;
          for (const id of L.trail) {
            const s = state(id);
            if (s === "running" || s === "waiting") continue;
            const p = pathTo(id);
            for (let i = 0; i < p.length - 1; i++) {
              const a = sim.bodies.get(p[i]);
              const b = sim.bodies.get(p[i + 1]);
              if (!a || !b) continue;
              for (let j = 0; j < 2; j++) {
                const q = (now / 1600 + j / 2 + i * 0.23) % 1;
                ctx.globalAlpha = 0.7 * Math.sin(q * Math.PI);
                ctx.beginPath();
                ctx.arc(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q, 2 / v.k, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
        // Dots travelling from the Mind to a node at work (or waiting on the owner).
        for (const n of NODES) {
          const s = state(n.id);
          if (s !== "running" && s !== "waiting") continue;
          const p = pathTo(n.id);
          ctx.fillStyle = stateColor(n.id);
          for (let i = 0; i < p.length - 1; i++) {
            const a = sim.bodies.get(p[i]);
            const b = sim.bodies.get(p[i + 1]);
            if (!a || !b) continue;
            for (let j = 0; j < 3; j++) {
              const q = (now / (s === "waiting" ? 1800 : 900) + j / 3 + i * 0.17) % 1;
              ctx.globalAlpha = Math.sin(q * Math.PI);
              ctx.beginPath();
              ctx.arc(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q, 2.4 / v.k, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      // Bubbles.
      for (const n of NODES) {
        const b = sim.bodies.get(n.id);
        if (!b) continue;
        ctx.globalAlpha = 1;
        if (glowing(n.id)) {
          const c = stateColor(n.id);
          const s = state(n.id);
          const loop = s === "running" ? (now % 1200) / 1200 : s === "waiting" ? 0.5 + 0.5 * Math.sin(now / 400) : Math.min(1, since(n.id) / 900);
          ctx.fillStyle = c;
          ctx.globalAlpha = 0.18 * (s === "running" || s === "waiting" ? 1 : 1 - loop);
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + 9, 0, Math.PI * 2);
          ctx.fill();
          if (!still.matches) {
            ctx.strokeStyle = c;
            ctx.lineWidth = 2 / v.k;
            ctx.globalAlpha = 0.8 * (1 - loop);
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r + 3 + loop * 16, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        if (n.kind === "mind") {
          const img = images.get("avatar");
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fillStyle = C.mind;
          ctx.fill();
          ctx.clip();
          if (img?.complete && img.naturalWidth) {
            const s2 = b.r * 2.1; // the whole character, like the app's avatar
            ctx.drawImage(img, b.x - s2 / 2, b.y - s2 / 2 + b.r * 0.12, s2, s2);
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
            const img = n.app ? images.get(`app:${n.app}`) : undefined;
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
          ctx.globalAlpha = L.running ? 0.9 : 0.55;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + 3.5 / v.k, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Labels last, outlined in the night colour so lines never cut through them.
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      for (const n of NODES) {
        const b = sim.bodies.get(n.id);
        if (!b) continue;
        const strong = hover === n.id || glowing(n.id);
        const px = (n.kind === "mind" ? 13 : n.kind === "tool" ? 10.5 : 11.5) / Math.max(0.8, v.k);
        ctx.font = `${n.kind === "mind" || strong ? 600 : 500} ${px}px ${font}`;
        ctx.strokeStyle = C.bg;
        ctx.lineWidth = 4 / v.k;
        const y = b.y + b.r + 5 / v.k;
        ctx.strokeText(n.label, b.x, y);
        ctx.fillStyle = strong || n.kind === "mind" ? C.fg : n.kind === "tool" ? C.faint : C.muted;
        ctx.fillText(n.label, b.x, y);
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      if (visible && !document.hidden) draw(now);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    // Drag a bubble (linked ones follow and it springs back); the torch follows the mouse.
    let drag: { id: string; x: number; y: number; moved: boolean } | null = null;
    const local = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      const p = local(e);
      const id = hit(p.x, p.y);
      if (!id) return;
      drag = { id, x: p.x, y: p.y, moved: false };
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
      const b = sim.bodies.get(drag.id);
      if (b) {
        const wpt = toWorld(p.x, p.y);
        b.x = wpt.x;
        b.y = wpt.y;
        b.vx = 0;
        b.vy = 0;
        b.pinned = true;
        sim.alpha = Math.max(sim.alpha, 0.6);
      }
    };
    const up = () => {
      if (!drag) return;
      const b = sim.bodies.get(drag.id);
      if (b && drag.id !== MIND) b.pinned = false;
      sim.alpha = Math.max(sim.alpha, 0.7);
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
    // No panel: the graph sits straight on the night sky; its edges fade out (a mask on the canvas).
    <div className="relative">
      <div ref={wrap} className="relative aspect-[1000/640] w-full">
        <canvas
          ref={canvas}
          role="img"
          aria-label="Penny's Mind Graph: its skills, tools, apps, memory and wallet. Nodes light up as Penny pays a bill."
          className="graph-fade absolute inset-0 size-full touch-pan-y"
        />
      </div>

      {/* Penny's steps, ticking along with the graph */}
      <div className="glass-dark absolute bottom-5 right-5 w-[310px] rounded-[20px] p-5 max-md:static max-md:m-4 max-md:w-auto">
        <p className="mb-3 text-[14px] font-medium text-[#F2F1EC]">What Penny just did</p>
        <ol className="flex flex-col gap-2.5">
          {RUN.map((r, i) => {
            const done = i < step || (i === step && i === RUN.length - 1);
            const now = i === step && !done;
            return (
              <li key={r.text} className="flex items-center gap-2.5 text-[13.5px] text-[#F2F1EC] transition-opacity duration-300" style={{ opacity: i <= step ? 1 : 0.32 }}>
                <span
                  className="grid size-5 shrink-0 place-items-center rounded-full"
                  style={{
                    background: now ? (r.wait ? "rgb(240 180 60 / 0.2)" : "rgb(110 155 255 / 0.2)") : done ? "rgb(70 194 122 / 0.2)" : "rgb(242 241 236 / 0.08)",
                    color: now ? (r.wait ? C.warning : C.info) : C.success,
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
