"use client";

import { useEffect, useRef, useState } from "react";

// "Watch your Mind think": a world of Minds drawn like Obsidian's graph view. Penny's graph sits in
// the middle (its skills, the tools and apps they reach, its memory and wallet, as in Ancung's app
// live view, PR #154) and dozens of other Minds float around it, each a hub with its skills and many
// small bubbles. One calm colour for every node; lime is the only accent, for what Penny is doing and
// for the bubble under the cursor and its links.
//
// One physics world for every node (springs along the links, a soft push between neighbours, and
// collisions on a grid, so it stays fast with ~1,500 nodes): drag a bubble into another Mind's graph
// and those bubbles get pushed aside, like Obsidian. Drag the background to pan; pinch on a trackpad
// or Ctrl/⌘ + scroll to zoom (plain scrolling still scrolls the page), or use the + / − buttons.
// Penny plays a scripted run (paying the internet bill) while in view. Reduced motion: still.

type Kind = "mind" | "skill" | "leaf";
type N = { x: number; y: number; vx: number; vy: number; r: number; m: number; kind: Kind; label: string; c: number; hx: number; hy: number; pinned: boolean };
type L = { a: number; b: number; rest: number };

// One tone (the brand's lime) at three strengths, and white for what is lit.
const SKILL = "#D8F04A";
const LEAF = "#93A63A";
const LINE = "rgba(216,240,74,0.15)";
const LIME = "#FFFFFF";
const AVATARS = ["/minds/payments-mind.webp", "/minds/general-assistant.webp", "/minds/email-manager.webp"];
const AMBER = "#F0B43C";
/** What the rest of the world keeps while one bubble is hovered or picked: 20% darker. */
const DIM = 0.8;

// One line for the card that opens on a click.
const ABOUT: Record<string, string> = {
  "Daily planner": "Plans your day from your calendar.",
  "Email helper": "Reads your inbox and sorts what matters.",
  Payments: "Pays your bills inside your limits, after you approve.",
  "Wallet watch": "Tells you when your wallet changes.",
  "Meeting prep": "Gets you ready for your next meeting.",
  "Other apps": "Reaches websites and other apps for you.",
  "Email address": "Gives the Mind its own email address.",
  "NEAR account lookup": "Checks a NEAR account before anything is sent.",
  Research: "Looks things up and sums them up.",
  Reminders: "Reminds you at the right time.",
  Invoices: "Keeps track of the bills you get.",
  Travel: "Plans trips and keeps the details together.",
  Memory: "What the Mind remembers about you, so you never repeat yourself.",
  Notes: "Keeps notes you can ask about later.",
  Shopping: "Keeps your lists and finds what you need.",
  "Google Calendar": "Reads your events and adds new ones.",
  "Google Meet": "Adds a meeting link to your events.",
  Calculator: "Does the maths, exactly.",
  Gmail: "Your inbox, read only with your OK.",
  "Penny's email": "Penny's own address, to email you.",
  Wallet: "Penny's NEAR wallet. Your limits are enforced outside the AI, before signing.",
  "NEAR lookup": "Looks up a NEAR account.",
  Clock: "Knows the time in your time zone.",
  Websites: "Opens a web page to read it.",
  "Skill search": "Finds a skill for something new.",
};
export type Picked = { title: string; kind: string; about: string };
const NIGHT = "#0a0d1c";

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// ---- The world --------------------------------------------------------------------------------

const PENNY: [string, Kind, string?][] = [
  ["Penny", "mind"],
  ["Daily planner", "skill", "Penny"],
  ["Google Calendar", "leaf", "Daily planner"],
  ["Google Meet", "leaf", "Daily planner"],
  ["Calculator", "leaf", "Daily planner"],
  ["Email helper", "skill", "Penny"],
  ["Gmail", "leaf", "Email helper"],
  ["Email address", "skill", "Penny"],
  ["Penny's email", "leaf", "Email address"],
  ["Memory", "skill", "Penny"],
  ["Payments", "skill", "Penny"],
  ["Wallet", "leaf", "Payments"],
  ["NEAR lookup", "leaf", "Payments"],
  ["Clock", "leaf", "Payments"],
  ["NEAR account lookup", "skill", "Penny"],
  ["Other apps", "skill", "Penny"],
  ["Websites", "leaf", "Other apps"],
  ["Wallet watch", "skill", "Penny"],
  ["Skill search", "leaf", "Penny"],
];
// Penny's run: which nodes are at work in each step (by label), and whether it waits on the owner.
const RUN: { on: string[]; trail: string[]; wait?: boolean }[] = [
  { on: ["Payments"], trail: ["Payments"] },
  { on: ["NEAR lookup"], trail: ["NEAR lookup"] },
  { on: ["Wallet"], trail: ["Wallet"], wait: true },
  { on: ["Wallet"], trail: [] },
  { on: ["Memory"], trail: ["Memory"] },
];
const STEP_MS = 1800;

const SKILLS = ["Daily planner", "Email helper", "Payments", "Wallet watch", "Meeting prep", "Other apps", "Email address", "Research", "Reminders", "Invoices", "Travel", "Memory", "Notes", "Shopping"];
const NAMES = ["Atlas", "Mira", "Juno", "Otto", "Kiko", "Sora", "Bima", "Lumi", "Nala", "Rio", "Vega", "Tala", "Iris", "Odin", "Rumi", "Ezra", "Kai", "Noa", "Dewi", "Arlo", "Maya", "Zane", "Pia", "Elio", "Sena", "Taro", "Wren", "Ayla", "Bodhi", "Cleo", "Dara", "Emre", "Fia", "Gita", "Hugo", "Ines"];

function buildWorld(COUNT: number) {
  const nodes: N[] = [];
  const links: L[] = [];
  const r = rng(7);
  const add = (n: Omit<N, "vx" | "vy" | "m" | "pinned">) => {
    nodes.push({ ...n, vx: 0, vy: 0, m: n.r * n.r, pinned: false });
    return nodes.length - 1;
  };
  const ring = (cx: number, cy: number, i: number, gap: number, start: number) => {
    // sunflower spiral around a hub, so a new cluster starts out round
    const a = i * 2.39996;
    const d = start + gap * Math.sqrt(i + 1);
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
  };

  // Penny, in the middle.
  const ids = new Map<string, number>();
  PENNY.forEach(([label, kind, parent], i) => {
    const p = parent ? nodes[ids.get(parent)!] : null;
    const pos = p ? ring(p.x, p.y, i, 30, kind === "skill" ? 120 : 50) : { x: 0, y: 0 };
    const id = add({ ...pos, r: kind === "mind" ? 18 : kind === "skill" ? 8 : 6, kind, label, c: 0, hx: 0, hy: 0 });
    ids.set(label, id);
    if (parent) links.push({ a: ids.get(parent)!, b: id, rest: kind === "skill" ? 170 : 85 });
  });

  // The other Minds, packed around Penny on a sunflower (gravity pulls them together into one
  // disc, like Obsidian's graph view); a few are big, most are small.
  for (let k = 1; k <= COUNT; k++) {
    const a = k * 2.39996 + 0.6;
    const d = 230 + 92 * Math.sqrt(k);
    const hx = Math.cos(a) * d * 1.15;
    const hy = Math.sin(a) * d * 0.95;
    const big = r() < 0.12;
    const hub = add({ x: hx, y: hy, r: big ? 11 : 7 + r() * 3, kind: "mind", label: NAMES[k % NAMES.length], c: k, hx, hy });
    const skills = [...SKILLS].sort(() => r() - 0.5).slice(0, 2 + Math.floor(r() * 4));
    const skillIds = skills.map((label, i) => {
      const pos = ring(hx, hy, i, 18, 40);
      const id = add({ ...pos, r: 4.5, kind: "skill", label, c: k, hx, hy });
      links.push({ a: hub, b: id, rest: 60 });
      return id;
    });
    // many small bubbles: some on the Mind itself (a dandelion), some on its skills
    const leaves = big ? 90 + Math.floor(r() * 120) : 12 + Math.floor(r() * 45);
    for (let j = 0; j < leaves; j++) {
      const onHub = r() < 0.6 || !skillIds.length;
      const parent = onHub ? hub : skillIds[Math.floor(r() * skillIds.length)];
      const p = nodes[parent];
      const pos = ring(p.x, p.y, j, 9, 22);
      const id = add({ ...pos, r: 2.4, kind: "leaf", label: "", c: k, hx, hy });
      links.push({ a: parent, b: id, rest: onHub ? 40 + r() * (big ? 110 : 60) : 22 + r() * 18 });
    }
  }
  return { nodes, links, penny: ids };
}

// ---- Physics: springs, a soft push between neighbours, collisions; neighbours found on a grid ----

const CELL = 80;

function tick(nodes: N[], links: L[], alpha: number) {
  for (const l of links) {
    const a = nodes[l.a];
    const b = nodes[l.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const f = ((d - l.rest) / d) * 0.06 * alpha;
    const wa = b.m / (a.m + b.m);
    const wb = a.m / (a.m + b.m);
    a.vx += dx * f * wa;
    a.vy += dy * f * wa;
    b.vx -= dx * f * wb;
    b.vy -= dy * f * wb;
  }
  // gravity: every Mind is pulled to the middle, so the graphs pack together into one disc
  for (const n of nodes)
    if (n.kind === "mind") {
      n.vx -= n.x * 0.004 * alpha;
      n.vy -= n.y * 0.004 * alpha;
    }
  const grid = new Map<number, number[]>();
  const key = (cx: number, cy: number) => cx * 73856093 + cy * 19349663;
  nodes.forEach((n, i) => {
    const k = key(Math.floor(n.x / CELL), Math.floor(n.y / CELL));
    const cell = grid.get(k);
    if (cell) cell.push(i);
    else grid.set(k, [i]);
  });
  nodes.forEach((p, i) => {
    const cx = Math.floor(p.x / CELL);
    const cy = Math.floor(p.y / CELL);
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        const cell = grid.get(key(cx + ox, cy + oy));
        if (!cell) continue;
        for (const j of cell) {
          if (j <= i) continue;
          const q = nodes[j];
          let dx = q.x - p.x;
          let dy = q.y - p.y;
          let d = Math.hypot(dx, dy);
          if (d > CELL) continue;
          if (d < 0.01) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d = Math.hypot(dx, dy);
          }
          // a soft push that spreads bubbles out, stronger between different Minds
          const push = ((p.c === q.c ? (p.c === 0 ? 400 : 26) : 60) / (d * d + 30)) * alpha;
          // and a hard push when they touch
          // Penny's bubbles keep room for their labels
          const min = p.r + q.r + (p.c === 0 || q.c === 0 ? 46 : p.kind === "leaf" && q.kind === "leaf" ? 5 : 12);
          const hard = d < min ? (min - d) * 0.5 : 0;
          const f = push + hard;
          const wp = q.m / (p.m + q.m);
          const wq = p.m / (p.m + q.m);
          p.vx -= (dx / d) * f * wp;
          p.vy -= (dy / d) * f * wp;
          q.vx += (dx / d) * f * wq;
          q.vy += (dy / d) * f * wq;
        }
      }
  });
  for (const n of nodes) {
    if (n.pinned) {
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    n.vx *= 0.6;
    n.vy *= 0.6;
    n.x += n.vx;
    n.y += n.vy;
  }
}

export function MindGraph() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ zoom: (f: number) => void; reset: () => void } | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const pickRef = useRef<(i: number) => void>(() => {});
  const run = useRef({ on: new Map<number, { at: number; wait: boolean }>(), trail: new Set<number>(), running: false });

  useEffect(() => {
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const font = getComputedStyle(document.body).fontFamily;
    // Fewer Minds on phones and slower machines, so it stays smooth there.
    const small = window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;
    const { nodes, links, penny } = buildWorld(small ? 30 : 64);
    let alpha = 0;
    // The layout settles before it is seen, a few ticks per frame (never one long freeze): it starts
    // once the section is within about a screen and a half (see `near` below).
    const WARM = 360;
    let warm = 0;
    let near = false;
    const pics = AVATARS.map((src) => {
      const im = new Image();
      im.src = src;
      return im;
    });

    // neighbours, for hover and Penny's trail
    const nbr = nodes.map(() => [] as number[]);
    const parent = new Map<number, number>();
    links.forEach((l, i) => {
      nbr[l.a].push(l.b);
      nbr[l.b].push(l.a);
      parent.set(l.b, l.a);
      void i;
    });
    const pathTo = (id: number) => {
      const out = [id];
      while (parent.has(out[0])) out.unshift(parent.get(out[0])!);
      return out;
    };

    // ---- the view -----
    let size = { w: 0, h: 0, dpr: 1 };
    const view = { x: 0, y: 0, k: 1 };
    const homeK = () => Math.max(0.35, Math.min(0.8, (size.w / 1500) * 0.75));
    const reset = () => {
      view.k = homeK();
      view.x = 0;
      view.y = 0;
    };
    const resize = () => {
      const r = box.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size = { w: r.width, h: r.height, dpr };
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      if (!view.k || view.k === 1) reset();
    };
    resize();
    reset();
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(box);
    const nearIo = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) near = true;
    }, { rootMargin: "150% 0px" });
    nearIo.observe(box);

    const zoomAt = (px: number, py: number, f: number) => {
      const k = Math.min(4, Math.max(0.12, view.k * f));
      const wx = (px - size.w / 2 - view.x) / view.k;
      const wy = (py - size.h / 2 - view.y) / view.k;
      view.k = k;
      view.x = px - size.w / 2 - wx * k;
      view.y = py - size.h / 2 - wy * k;
    };
    api.current = { zoom: (f) => zoomAt(size.w / 2, size.h / 2, f), reset };

    const toWorld = (px: number, py: number) => ({ x: (px - size.w / 2 - view.x) / view.k, y: (py - size.h / 2 - view.y) / view.k });
    const hit = (px: number, py: number) => {
      const p = toWorld(px, py);
      let best = -1;
      let bestD = Infinity;
      nodes.forEach((n, i) => {
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < n.r + 7 / view.k && d < bestD) {
          best = i;
          bestD = d;
        }
      });
      return best;
    };

    let hover = -1;
    let selected = -1;
    const hubOf = new Map<number, number>();
    nodes.forEach((n, i) => {
      if (n.kind === "mind") hubOf.set(n.c, i);
    });
    const describe = (i: number): Picked => {
      const n = nodes[i];
      const mind = nodes[hubOf.get(n.c)!].label;
      if (n.kind === "mind") {
        const skills = nbr[i].filter((j) => nodes[j].kind === "skill").map((j) => nodes[j].label);
        return {
          title: n.label,
          kind: "Mind",
          about: n.c === 0 ? "A Payments Mind. Pays your bills inside your limits and asks you first." : `A Mind with ${skills.length} skills: ${skills.join(", ")}.`,
        };
      }
      if (n.kind === "skill") return { title: n.label, kind: `Skill · ${mind}`, about: ABOUT[n.label] ?? "A skill this Mind uses." };
      if (n.label) return { title: n.label, kind: `Tool · ${mind}`, about: ABOUT[n.label] ?? "A tool this Mind can use." };
      return { title: "A memory", kind: mind, about: `Something ${mind} learned or did for its owner.` };
    };
    pickRef.current = (i: number) => {
      selected = i;
      setPicked(i >= 0 ? describe(i) : null);
    };
    const smooth = (a: number, b: number, v: number) => {
      const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
      return x * x * (3 - 2 * x);
    };

    const draw = (now: number) => {
      if (alpha > 0.004) {
        tick(nodes, links, alpha);
        alpha *= 0.985;
      }
      const { w, h, dpr } = size;
      const k = view.k;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w / 2 + view.x), dpr * (h / 2 + view.y));
      // what is on screen, in world units (with a margin)
      const x0 = (-w / 2 - view.x) / k - 40;
      const x1 = (w / 2 - view.x) / k + 40;
      const y0 = (-h / 2 - view.y) / k - 40;
      const y1 = (h / 2 - view.y) / k + 40;
      const seen = (n: N) => n.x > x0 && n.x < x1 && n.y > y0 && n.y < y1;

      const R = run.current;
      const lead = selected >= 0 ? selected : hover;
      const focus = lead >= 0 ? new Set([lead, ...nbr[lead]]) : null;
      // the card follows its bubble
      if (selected >= 0 && card.current) {
        const n = nodes[selected];
        card.current.style.transform = `translate3d(${w / 2 + view.x + n.x * k + n.r * k + 14}px, ${h / 2 + view.y + n.y * k - 20}px, 0)`;
      }
      const trailLinks = new Set<string>();
      for (const id of R.trail) {
        const p = pathTo(id);
        for (let i = 0; i < p.length - 1; i++) trailLinks.add(`${p[i]}>${p[i + 1]}`);
      }
      const active = [...R.on.keys()];
      for (const id of active) {
        const p = pathTo(id);
        for (let i = 0; i < p.length - 1; i++) trailLinks.add(`${p[i]}>${p[i + 1]}`);
      }

      // Lines: all the quiet ones in one path, then the lit ones.
      ctx.lineWidth = 1 / k;
      ctx.strokeStyle = LINE;
      ctx.globalAlpha = focus ? DIM : 1;
      ctx.beginPath();
      const lit: L[] = [];
      for (const l of links) {
        const a = nodes[l.a];
        const b = nodes[l.b];
        if (!seen(a) && !seen(b)) continue;
        if (trailLinks.has(`${l.a}>${l.b}`) || (focus && (l.a === lead || l.b === lead))) {
          lit.push(l);
          continue;
        }
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (const l of lit) {
        const a = nodes[l.a];
        const b = nodes[l.b];
        const hot = focus && (l.a === lead || l.b === lead);
        ctx.strokeStyle = LIME;
        ctx.globalAlpha = hot ? 0.9 : R.running ? 0.75 : 0.45;
        ctx.lineWidth = (hot ? 1.6 : 1.8) / k;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      // dots running from Penny to the node at work
      if (!still)
        for (const [id, s] of R.on) {
          const p = pathTo(id);
          ctx.fillStyle = s.wait ? AMBER : LIME;
          for (let i = 0; i < p.length - 1; i++) {
            const a = nodes[p[i]];
            const b = nodes[p[i + 1]];
            for (let j = 0; j < 3; j++) {
              const q = (now / (s.wait ? 1800 : 900) + j / 3 + i * 0.17) % 1;
              ctx.globalAlpha = Math.sin(q * Math.PI);
              ctx.beginPath();
              ctx.arc(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q, 2.2 / k, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      ctx.globalAlpha = 1;

      // Bubbles: the quiet ones in one path per tone, then the lit ones, then the Minds.
      ctx.globalAlpha = focus ? DIM : 1;
      const hot: number[] = [];
      for (const kind of ["leaf", "skill"] as const) {
        ctx.fillStyle = kind === "skill" ? SKILL : LEAF;
        ctx.beginPath();
        nodes.forEach((n, i) => {
          if (n.kind !== kind || !seen(n)) return;
          if ((focus && focus.has(i)) || R.on.has(i) || R.trail.has(i)) {
            hot.push(i);
            return;
          }
          // a bubble never gets smaller than about a pixel on screen
          const r = Math.max(n.r, 0.9 / k);
          ctx.moveTo(n.x + r, n.y);
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        });
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const i of hot) {
        const n = nodes[i];
        const s = R.on.get(i);
        if (s && !still) {
          const loop = s.wait ? 0.5 + 0.5 * Math.sin(now / 400) : ((now - s.at) % 1200) / 1200;
          ctx.strokeStyle = s.wait ? AMBER : LIME;
          ctx.lineWidth = 1.6 / k;
          ctx.globalAlpha = 0.8 * (1 - loop);
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 3 + loop * 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = s?.wait ? AMBER : LIME;
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(n.r, 0.9 / k), 0, Math.PI * 2);
        ctx.fill();
      }
      // The Minds, as in Ancung's app: the profile picture in a circle with a light ring.
      nodes.forEach((n, i) => {
        if (n.kind !== "mind" || !seen(n)) return;
        const r = Math.max(n.r, 1.5 / k);
        ctx.globalAlpha = focus && !focus.has(i) ? DIM : 1;
        const img = pics[n.c % pics.length];
        ctx.save();
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#F2F1EC";
        ctx.fill();
        if (r * k > 4 && img.complete && img.naturalWidth) {
          ctx.clip();
          const s2 = r * 2.1;
          ctx.drawImage(img, n.x - s2 / 2, n.y - s2 / 2 + r * 0.12, s2, s2);
        }
        ctx.restore();
        ctx.strokeStyle = focus && focus.has(i) ? LIME : "#F2F1EC";
        ctx.lineWidth = (n.c === 0 ? 2 : 1.4) / k;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      // Labels fade in as you zoom in, like Obsidian: Minds first, then skills; Penny's always.
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      nodes.forEach((n, i) => {
        if (!n.label || !seen(n)) return;
        const mine = n.c === 0;
        const a =
          i === hover || (focus && focus.has(i))
            ? 1
            : n.kind === "mind"
              ? smooth(mine ? 0.15 : 0.45, mine ? 0.3 : 0.75, k)
              : smooth(mine ? 0.3 : 1.1, mine ? 0.5 : 1.5, k);
        if (a <= 0.01) return;
        const px = (n.kind === "mind" ? (mine ? 14 : 12) : 11) / k;
        ctx.font = `${n.kind === "mind" ? 600 : 500} ${px}px ${font}`;
        ctx.globalAlpha = a * (focus && !focus.has(i) ? DIM : 1);
        ctx.strokeStyle = NIGHT;
        ctx.lineWidth = 4 / k;
        const y = n.y + n.r + 4 / k;
        ctx.strokeText(n.label, n.x, y);
        ctx.fillStyle = n.kind === "mind" || i === hover ? "#F2F1EC" : "#A6A39B";
        ctx.fillText(n.label, n.x, y);
      });
      ctx.globalAlpha = 1;
    };

    let frame = 0;
    const loop = (now: number) => {
      if (near && warm < WARM) {
        const t0 = performance.now();
        while (warm < WARM && performance.now() - t0 < 8) {
          tick(nodes, links, Math.max(0.15, 1 - warm / WARM));
          warm++;
        }
      }
      if (visible && !document.hidden) draw(now);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    // ---- Penny's run while in view -----
    const apply = (i: number) => {
      const R = run.current;
      if (i < 0) {
        R.on.clear();
        R.trail.clear();
        R.running = false;
        return;
      }
      R.on.clear();
      const now = performance.now();
      for (const label of RUN[i].on) R.on.set(penny.get(label)!, { at: now, wait: !!RUN[i].wait });
      for (const label of RUN[i].trail) R.trail.add(penny.get(label)!);
      R.running = i < RUN.length - 1;
      if (!R.running) R.on.clear();
    };
    let timer = 0;
    let step = -1;
    const next = () => {
      step = step >= RUN.length + 1 ? -1 : step + 1;
      if (step <= RUN.length - 1) apply(step);
      timer = window.setTimeout(next, step === -1 ? 1200 : STEP_MS);
    };
    const runIo = new IntersectionObserver(
      ([e]) => {
        window.clearTimeout(timer);
        if (e.isIntersecting) {
          step = -1;
          apply(-1);
          timer = window.setTimeout(next, 600);
        }
      },
      { threshold: 0.3 },
    );
    if (still) RUN.forEach((_, i) => apply(i));
    else runIo.observe(box);

    // ---- pointer: drag a bubble or the background; pinch / Ctrl+scroll to zoom -----
    let drag: { id: number; x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return; // touch scrolls the page
      const p = local(e);
      const id = hit(p.x, p.y);
      drag = { id, x: p.x, y: p.y, vx: view.x, vy: view.y, moved: false };
      if (id >= 0) nodes[id].pinned = true;
      cv.setPointerCapture(e.pointerId);
      cv.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (!drag) {
        hover = hit(p.x, p.y);
        cv.style.cursor = hover >= 0 ? "grab" : "default";
        return;
      }
      if (Math.hypot(p.x - drag.x, p.y - drag.y) > 4) drag.moved = true;
      if (!drag.moved) return;
      if (drag.id >= 0) {
        const wpt = toWorld(p.x, p.y);
        const n = nodes[drag.id];
        n.x = wpt.x;
        n.y = wpt.y;
        alpha = 1; // fully warm while dragging, so the bubbles follow and others get pushed aside
      } else {
        view.x = drag.vx + (p.x - drag.x);
        view.y = drag.vy + (p.y - drag.y);
      }
    };
    const up = () => {
      if (!drag) return;
      if (drag.id >= 0) {
        nodes[drag.id].pinned = false;
        alpha = Math.max(alpha, 0.5);
      }
      // a click (no drag) opens the bubble's card, or closes it on the background / the same bubble
      if (!drag.moved) pickRef.current(drag.id >= 0 && drag.id !== selected ? drag.id : -1);
      drag = null;
      cv.style.cursor = hover >= 0 ? "grab" : "default";
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") pickRef.current(-1);
    };
    window.addEventListener("keydown", esc);
    const leave = () => {
      if (!drag) hover = -1;
    };
    const wheel = (e: WheelEvent) => {
      // a trackpad pinch arrives as Ctrl + wheel; plain wheel keeps scrolling the page
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.01));
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("pointerleave", leave);
    cv.addEventListener("wheel", wheel, { passive: false });

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      ro.disconnect();
      io.disconnect();
      nearIo.disconnect();
      runIo.disconnect();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      cv.removeEventListener("pointerleave", leave);
      cv.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", esc);
    };
  }, []);

  return (
    // Full width, no panel: the graphs sit straight on the night and fade out at the edges.
    <div ref={wrap} className="relative h-[clamp(560px,90vh,900px)] w-full">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Penny's Mind Graph among dozens of other Minds, each with its skills, tools and memories. Penny's nodes light up as it pays a bill."
        className="graph-fade absolute inset-0 size-full touch-pan-y"
      />
      {/* A small card for the picked bubble; it follows the bubble. */}
      <div ref={card} className="pointer-events-none absolute left-0 top-0" aria-live="polite">
        {picked && (
          <div className="glass-dark pointer-events-auto w-[240px] rounded-[16px] px-4 py-3 text-[#F2F1EC]">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#D8F04A]">{picked.kind}</span>
              <button type="button" aria-label="Close" onClick={() => pickRef.current(-1)} className="-mr-1 -mt-0.5 text-[15px] leading-none text-[#F2F1EC]/60 hover:text-[#F2F1EC]">
                ×
              </button>
            </div>
            <p className="mt-1 text-[15px] font-medium leading-tight">{picked.title}</p>
            <p className="mt-1 text-[13px] leading-[1.45] text-[#F2F1EC]/70">{picked.about}</p>
          </div>
        )}
      </div>
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 text-[12.5px] text-[#F2F1EC]/55">
        <span className="hidden md:inline">Drag to move · pinch or ⌘/Ctrl + scroll to zoom</span>
        <div className="glass-dark flex items-center gap-0.5 rounded-full p-1 text-[#F2F1EC]">
          {[
            ["−", "Zoom out", () => api.current?.zoom(1 / 1.35)],
            ["+", "Zoom in", () => api.current?.zoom(1.35)],
          ].map(([t, label, fn]) => (
            <button
              key={label as string}
              type="button"
              aria-label={label as string}
              onClick={fn as () => void}
              className="grid size-8 place-items-center rounded-full text-[17px] leading-none transition-colors hover:bg-white/10"
            >
              {t as string}
            </button>
          ))}
          <button type="button" onClick={() => api.current?.reset()} className="h-8 rounded-full px-3 transition-colors hover:bg-white/10">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
