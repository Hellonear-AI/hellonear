// The Mind Graph's world, shared by the page and the warm-up worker (warm.worker.ts): which
// nodes and links there are (seeded, so both build the same world) and one physics step.

/** The apps a bubble can show the logo of; the logos themselves are in MindGraph.tsx. */
export const APP_NAMES: Record<string, string> = {
  gmail: "Gmail",
  gcal: "Google Calendar",
  gmeet: "Google Meet",
  sheets: "Google Sheets",
  docs: "Google Docs",
  drive: "Google Drive",
  notion: "Notion",
  slack: "Slack",
  zoom: "Zoom",
  outlook: "Outlook",
};
const APP_KEYS = Object.keys(APP_NAMES);

export type Kind = "mind" | "skill" | "leaf";
/** What a bubble is, for drawing (the physics only knows `kind`). */
export type Tone = "mind" | "skill" | "tool" | "app" | "wallet" | "memory";
export type N = { x: number; y: number; vx: number; vy: number; r: number; m: number; kind: Kind; tone: Tone; app?: string; label: string; c: number; hx: number; hy: number; pinned: boolean };
export type L = { a: number; b: number; rest: number };

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// ---- The world --------------------------------------------------------------------------------

// [label, physics kind, parent, tone, app logo]
export const PENNY: [string, Kind, string?, Tone?, string?][] = [
  ["Penny", "mind"],
  ["Daily planner", "skill", "Penny"],
  ["Google Calendar", "leaf", "Daily planner", "app", "gcal"],
  ["Google Meet", "leaf", "Daily planner", "app", "gmeet"],
  ["Calculator", "leaf", "Daily planner", "tool"],
  ["Email helper", "skill", "Penny"],
  ["Gmail", "leaf", "Email helper", "app", "gmail"],
  ["Email address", "skill", "Penny"],
  ["Penny's email", "leaf", "Email address", "tool"],
  ["Memory", "skill", "Penny", "memory"],
  ["Payments", "skill", "Penny"],
  ["Wallet", "leaf", "Payments", "wallet"],
  ["NEAR lookup", "leaf", "Payments", "tool"],
  ["Clock", "leaf", "Payments", "tool"],
  ["Sheets", "skill", "Penny"],
  ["Google Sheets", "leaf", "Sheets", "app", "sheets"],
  ["NEAR account lookup", "skill", "Penny"],
  ["Other apps", "skill", "Penny"],
  ["Websites", "leaf", "Other apps", "tool"],
  ["Notion", "leaf", "Other apps", "app", "notion"],
  ["Wallet watch", "skill", "Penny"],
  ["Skill search", "leaf", "Penny", "tool"],
];


const SKILLS = ["Daily planner", "Email helper", "Payments", "Wallet watch", "Meeting prep", "Other apps", "Email address", "Research", "Reminders", "Invoices", "Travel", "Memory", "Notes", "Shopping"];
const NAMES = ["Atlas", "Mira", "Juno", "Otto", "Kiko", "Sora", "Bima", "Lumi", "Nala", "Rio", "Vega", "Tala", "Iris", "Odin", "Rumi", "Ezra", "Kai", "Noa", "Dewi", "Arlo", "Maya", "Zane", "Pia", "Elio", "Sena", "Taro", "Wren", "Ayla", "Bodhi", "Cleo", "Dara", "Emre", "Fia", "Gita", "Hugo", "Ines"];

export function buildWorld(COUNT: number) {
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
  PENNY.forEach(([label, kind, parent, tone, app], i) => {
    const p = parent ? nodes[ids.get(parent)!] : null;
    const pos = p ? ring(p.x, p.y, i, 30, kind === "skill" ? 120 : 50) : { x: 0, y: 0 };
    const t: Tone = tone ?? (kind === "mind" ? "mind" : "skill");
    // sizes after the app's (Mind 26, app 13, wallet 12, skill 11, memory 9, tool 7), scaled down
    const r = { mind: 18, skill: 8, app: 9, wallet: 8.5, memory: 7, tool: 5 }[t];
    const id = add({ ...pos, r, kind, tone: t, app, label, c: 0, hx: 0, hy: 0 });
    ids.set(label, id);
    if (parent) links.push({ a: ids.get(parent)!, b: id, rest: kind === "skill" ? 200 : 95 });
  });

  // The other Minds, packed around Penny on a sunflower (gravity pulls them together into one
  // disc, like Obsidian's graph view); a few are big, most are small.
  for (let k = 1; k <= COUNT; k++) {
    const a = k * 2.39996 + 0.6;
    const d = 230 + 92 * Math.sqrt(k);
    const hx = Math.cos(a) * d * 1.15;
    const hy = Math.sin(a) * d * 0.95;
    const big = r() < 0.12;
    const hub = add({ x: hx, y: hy, r: big ? 11 : 7 + r() * 3, kind: "mind", tone: "mind", label: NAMES[k % NAMES.length], c: k, hx, hy });
    const skills = [...SKILLS].sort(() => r() - 0.5).slice(0, 2 + Math.floor(r() * 4));
    const skillIds = skills.map((label, i) => {
      const pos = ring(hx, hy, i, 18, 40);
      const id = add({ ...pos, r: 4.5, kind: "skill", tone: "skill", label, c: k, hx, hy });
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
      // on the Mind: its memories and tool calls; on a skill: tools, now and then an app or a wallet
      const roll = r();
      const tone: Tone = onHub ? (roll < 0.35 ? "memory" : "tool") : roll < 0.14 ? "app" : roll < 0.2 ? "wallet" : "tool";
      const app = tone === "app" ? APP_KEYS[Math.floor(r() * APP_KEYS.length)] : undefined;
      const id = add({ ...pos, r: tone === "app" ? 4 : tone === "wallet" ? 3.4 : 2.4, kind: "leaf", tone, app, label: app ? APP_NAMES[app] : "", c: k, hx, hy });
      links.push({ a: parent, b: id, rest: onHub ? 40 + r() * (big ? 110 : 60) : 22 + r() * 18 });
    }
  }
  return { nodes, links, penny: ids };
}

// ---- Physics: springs, a soft push between neighbours, collisions; neighbours found on a grid ----

const CELL = 80;

export function tick(nodes: N[], links: L[], alpha: number, labelK: number) {
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
          const push = ((p.c === q.c ? (p.c === 0 ? 900 : 26) : 60) / (d * d + 30)) * alpha;
          // and a hard push when they touch
          // Penny's bubbles keep room for their labels
          const min = p.r + q.r + (p.c === 0 && q.c === 0 ? 62 : p.c === 0 || q.c === 0 ? 46 : p.kind === "leaf" && q.kind === "leaf" ? 5 : 12);
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
  // Penny's bubbles always show their labels, so each bubble with its label is a box, and boxes
  // that overlap are pushed apart along the shorter overlap (as in the app's sim.ts). Labels keep
  // their size on screen, so their size in the world depends on the zoom Penny is first seen at.
  const k = labelK;
  const half = (n: N) => Math.max(n.r, (n.label.length * 6.2 + 8) / k / 2) + 4 / k;
  const hh = (n: N) => n.r + 9 / k;
  const cy = (n: N) => n.y + 8 / k;
  const shove = Math.min(1, alpha * 6) * 0.5;
  for (let i = 0; i < PENNY.length; i++)
    for (let j = i + 1; j < PENNY.length; j++) {
      const p = nodes[i];
      const q = nodes[j];
      const ox = half(p) + half(q) - Math.abs(q.x - p.x);
      const oy = hh(p) + hh(q) - Math.abs(cy(q) - cy(p));
      if (ox <= 0 || oy <= 0) continue;
      const mx = ox < oy ? (ox / 2) * shove * (q.x >= p.x ? 1 : -1) : 0;
      const my = ox < oy ? 0 : (oy / 2) * shove * (cy(q) >= cy(p) ? 1 : -1);
      if (!p.pinned) {
        p.x -= mx;
        p.y -= my;
      }
      if (!q.pinned) {
        q.x += mx;
        q.y += my;
      }
    }
}
