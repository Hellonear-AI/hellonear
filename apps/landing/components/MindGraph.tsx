"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { buildWorld, PENNY, tick, type L, type N, type Tone } from "./graph/world";
import { GmailLogo, GoogleCalendarLogo, GoogleDocsLogo, GoogleDriveLogo, GoogleMeetLogo, GoogleSheetsLogo, NotionLogo, OutlookLogo, SlackLogo, ZoomLogo } from "./AppLogos";

// "Watch your Mind think": a world of Minds drawn like Obsidian's graph view. Penny's graph sits in
// the middle (its skills, the tools and apps they reach, its memory and wallet, as in Ancung's app
// live view, PR #154) and dozens of other Minds float around it, each a hub with its skills and many
// small bubbles. Drawn like the app's live view now (Ancung, apps/fe graph/MindGraph.tsx, 11 Nov):
// each kind its own colour (skills lime, tools blue, wallet amber, memory teal), apps as dark
// bubbles with their own logos, quiet grey lines, Penny's work in blue (amber while it waits on
// the owner), and under the cursor a magnet that leans nearby bubbles toward it and a lime torch on
// the lines. Zooming out stops at 40% (the app stops at 35%), so the world never shrinks
// to a speck.
//
// One physics world for every node (springs along the links, a soft push between neighbours, and
// collisions on a grid, so it stays fast with ~1,500 nodes): drag a bubble into another Mind's graph
// and those bubbles get pushed aside, like Obsidian. Drag the background to pan; pinch on a trackpad
// or Ctrl/⌘ + scroll to zoom (plain scrolling still scrolls the page), or use the + / − buttons.
// Penny plays a scripted run (paying the internet bill) while in view. Reduced motion: still.


// The app's node colours (apps/fe styles/globals.css `--node-*`, dark theme), on the night.
const FILL: Record<Exclude<Tone, "mind">, string> = { skill: "#D8F04A", tool: "#4C7DF0", app: "#161B2E", wallet: "#F0A93C", memory: "#2FB5A3" };
const LINE = "rgba(166,163,155,0.2)";
const APP_RING = "rgba(242,241,236,0.22)";
const LIME = "#D8F04A";
/** Penny's work: blue while running (the app's `--info`), amber while it waits on the owner. */
const INFO = "#6E9BFF";
const AVATARS = ["/minds/payments-mind.webp", "/minds/general-assistant.webp", "/minds/email-manager.webp"];
const AMBER = "#F0A93C";
// The cursor's magnet and torch, as in the app: bubbles within 120 screen px lean toward it (up to
// a third of the way, at most 8 units), and the lines within 90 px catch a lime light.
const MAGNET_REACH = 120;
const ZOOM_MAX = 3;
const MAGNET_PULL = 0.35;
const MAGNET_MAX = 8;
const TORCH = 90;
/** The app logos, drawn inside app bubbles (rendered hidden, then turned into images). */
const APPS: Record<string, [ComponentType<{ className?: string }>, string]> = {
  gmail: [GmailLogo, "Gmail"],
  gcal: [GoogleCalendarLogo, "Google Calendar"],
  gmeet: [GoogleMeetLogo, "Google Meet"],
  sheets: [GoogleSheetsLogo, "Google Sheets"],
  docs: [GoogleDocsLogo, "Google Docs"],
  drive: [GoogleDriveLogo, "Google Drive"],
  notion: [NotionLogo, "Notion"],
  slack: [SlackLogo, "Slack"],
  zoom: [ZoomLogo, "Zoom"],
  outlook: [OutlookLogo, "Outlook"],
};

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
  Sheets: "Reads a sheet and adds rows, after you approve.",
  "Google Sheets": "Your spreadsheets.",
  Notion: "Your Notion pages and databases.",
  "Google Docs": "Your documents.",
  "Google Drive": "Your files.",
  Slack: "Posts in your Slack channels, after you approve.",
  Zoom: "Creates Zoom meetings.",
  Outlook: "Your Outlook inbox.",
};
// Penny's run: which nodes are at work in each step (by label), and whether it waits on the owner.
const RUN: { on: string[]; trail: string[]; wait?: boolean }[] = [
  { on: ["Payments"], trail: ["Payments"] },
  { on: ["NEAR lookup"], trail: ["NEAR lookup"] },
  { on: ["Wallet"], trail: ["Wallet"], wait: true },
  { on: ["Wallet"], trail: [] },
  { on: ["Memory"], trail: ["Memory"] },
];
const STEP_MS = 1800;

export type Picked = { title: string; kind: string; about: string };
const NIGHT = "#0a0d1c";



export function MindGraph() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ zoom: (f: number) => void; reset: () => void } | null>(null);
  // Phones: the graph is a picture you scroll past until you tap "Explore"; then one finger drags a
  // bubble or moves the view and two fingers zoom, until "Done" (or the section leaves the screen).
  const [explore, setExplore] = useState(false);
  const exploreRef = useRef(false);
  useEffect(() => {
    exploreRef.current = explore;
  }, [explore]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const logoBox = useRef<HTMLDivElement>(null);
  const pickRef = useRef<(i: number) => void>(() => {});
  const run = useRef({ on: new Map<number, { at: number; wait: boolean }>(), trail: new Set<number>(), running: false, ver: 0 });

  useEffect(() => {
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const font = getComputedStyle(document.body).fontFamily;
    // Fewer Minds on phones and slower machines, so it stays smooth there.
    const small = window.innerWidth < 1024 || (navigator.hardwareConcurrency || 8) <= 4;
    const phone = window.innerWidth < 768;
    const COUNT = phone ? 14 : small ? 24 : 46;
    const { nodes, links, penny } = buildWorld(COUNT);
    // the zoom Penny is first seen at, for the size of its labels in the layout (set below)
    let labelK = 0.72;
    let alpha = 0;
    // The layout settles before it is seen, a few ticks per frame (never one long freeze): it starts
    // once the section is within about a screen and a half (see `near` below).
    const WARM = 360;
    let warm = 0;
    let near = false;
    // the still part of the graph, painted once and reused (see `draw`)
    const layer = document.createElement("canvas");
    const lctx = layer.getContext("2d")!;
    let layerKey = "";
    // bumped when an avatar or a logo finishes loading, so the layer is painted again with it
    let imgVer = 0;
    // Each picture is shrunk once into a small canvas as soon as it loads: drawing the 720 px avatars
    // and the SVG logos straight onto the graph cost ~90 ms (4x slower CPU) on its first paint.
    const bake = (im: HTMLImageElement, size: number) => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d")!.drawImage(im, 0, 0, size, size);
      imgVer++;
      return c;
    };
    const pics: (HTMLCanvasElement | null)[] = AVATARS.map(() => null);
    AVATARS.forEach((src, i) => {
      const im = new Image();
      im.onload = () => (pics[i] = bake(im, 192));
      im.src = src;
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
    // phones start closer in on Penny, so its labels have room
    const zoomMin = 0.4;
    const homeK = () => (phone ? 0.55 : Math.max(zoomMin, Math.min(0.8, (size.w / 1500) * 0.75)));
    const reset = () => {
      view.k = homeK();
      view.x = 0;
      view.y = 0;
    };
    const resize = () => {
      const r = box.getBoundingClientRect();
      const dpr = Math.min(phone ? 1.5 : 2, window.devicePixelRatio || 1);
      size = { w: r.width, h: r.height, dpr };
      cv.width = layer.width = Math.round(r.width * dpr);
      cv.height = layer.height = Math.round(r.height * dpr);
      if (!view.k || view.k === 1) reset();
    };
    resize();
    reset();
    labelK = view.k;
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!visible && exploreRef.current) setExplore(false);
    });
    io.observe(box);
    // The warm-up runs in a worker (warm.worker.ts), so the page stays smooth while it settles;
    // if workers fail, it runs here a few ticks per frame instead.
    let worker: Worker | null = null;
    let sliced = false;
    const startWarm = () => {
      try {
        worker = new Worker(new URL("./graph/warm.worker.ts", import.meta.url));
        worker.onmessage = (e: MessageEvent<Float32Array>) => {
          const xy = e.data;
          nodes.forEach((n, i) => {
            if (n.pinned) return;
            n.x = xy[i * 2];
            n.y = xy[i * 2 + 1];
            n.vx = 0;
            n.vy = 0;
          });
          warm = WARM;
          worker?.terminate();
          worker = null;
        };
        worker.onerror = () => {
          worker?.terminate();
          worker = null;
          sliced = true;
        };
        worker.postMessage({ count: COUNT, labelK, ticks: WARM });
      } catch {
        sliced = true;
      }
    };
    const nearIo = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !near) {
        near = true;
        startWarm();
      }
    }, { rootMargin: "150% 0px" });
    nearIo.observe(box);

    const zoomAt = (px: number, py: number, f: number) => {
      const k = Math.min(ZOOM_MAX, Math.max(zoomMin, view.k * f));
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
    // the cursor in canvas pixels (for the magnet and the torch), and each bubble's lean
    let torch: { x: number; y: number } | null = null;
    const magnet = new Map<number, { x: number; y: number }>();
    // the app logos as images the canvas can draw, from the hidden logos below the canvas
    const logos = new Map<string, HTMLCanvasElement>();
    logoBox.current?.querySelectorAll<HTMLElement>("[data-app]").forEach((el) => {
      const svg = el.querySelector("svg");
      if (!svg) return;
      const c = svg.cloneNode(true) as SVGSVGElement;
      c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      c.setAttribute("width", "64");
      c.setAttribute("height", "64");
      const im = new Image();
      im.onload = () => logos.set(el.dataset.app!, bake(im, 64));
      im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.outerHTML)}`;
    });
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
      if (n.tone === "skill") return { title: n.label, kind: `Skill · ${mind}`, about: ABOUT[n.label] ?? "A skill this Mind uses." };
      if (n.tone === "app") return { title: n.label, kind: `App · ${mind}`, about: ABOUT[n.label] ?? "An app this Mind can use." };
      if (n.tone === "wallet") return { title: n.label || "Wallet", kind: `Wallet · ${mind}`, about: ABOUT[n.label] ?? `${mind}'s NEAR wallet, inside the limits its owner set.` };
      if (n.tone === "memory") return { title: n.label || "A memory", kind: `Memory · ${mind}`, about: ABOUT[n.label] ?? `Something ${mind} learned or did for its owner.` };
      return { title: n.label || "A tool call", kind: `Tool · ${mind}`, about: ABOUT[n.label] ?? `A tool ${mind} used for its owner.` };
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
        tick(nodes, links, alpha, labelK);
        alpha *= 0.985;
      }
      const { w, h, dpr } = size;
      const k = view.k;
      // The magnet: bubbles near the cursor lean toward it and ease back when it leaves. Drawn
      // only: the offsets are added here and taken off again after drawing.
      const tp = torch && !drag ? toWorld(torch.x, torch.y) : null;
      const field = MAGNET_REACH / k;
      if (!still) {
        for (const [i, o] of magnet) {
          o.x *= 0.8;
          o.y *= 0.8;
          if (Math.abs(o.x) < 0.01 && Math.abs(o.y) < 0.01) magnet.delete(i);
        }
        if (tp)
          nodes.forEach((n, i) => {
            const dx = tp.x - n.x;
            const dy = tp.y - n.y;
            if (Math.abs(dx) > field || Math.abs(dy) > field) return;
            const away = Math.hypot(dx, dy);
            if (away >= field) return;
            const pull = MAGNET_PULL * (1 - away / field) ** 2;
            const d = Math.hypot(dx * pull, dy * pull);
            const m = d > MAGNET_MAX ? MAGNET_MAX / d : 1;
            const o = magnet.get(i) ?? { x: 0, y: 0 };
            // ease toward the pull (the decay above already took 20% off)
            o.x += dx * pull * m * 0.2;
            o.y += dy * pull * m * 0.2;
            magnet.set(i, o);
          });
        for (const [i, o] of magnet) {
          nodes[i].x += o.x;
          nodes[i].y += o.y;
        }
      }
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

      // Everything that only changes when the view, the layout, the hover or Penny's step changes is
      // painted once into a layer and reused; each frame then copies it and draws only what moves
      // (the torch, the dots and the pulses). While bubbles move (the magnet, a drag, the layout),
      // the layer is repainted every frame.
      const moving = alpha > 0.004 || magnet.size > 0 || drag !== null;
      const key = `${view.x}|${view.y}|${k}|${w}|${h}|${dpr}|${lead}|${R.ver}|${imgVer}|${warm}`;
      if (moving || key !== layerKey) {
        layerKey = moving ? "" : key;
        const ctx = lctx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w / 2 + view.x), dpr * (h / 2 + view.y));
        // Lines: all the quiet ones in one grey path, then the lit ones.
        ctx.lineWidth = 1 / k;
        ctx.strokeStyle = LINE;
        ctx.globalAlpha = 1;
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
          const w = R.on.get(l.b);
          ctx.strokeStyle = hot ? "#F2F1EC" : w?.wait ? AMBER : INFO;
          ctx.globalAlpha = hot ? 0.85 : R.running ? 0.9 : 0.55;
          ctx.lineWidth = (hot ? 1.6 : 2) / k;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Bubbles: one path per colour for the quiet ones, then the apps with their logos, then the
        // lit ones, then the Minds.
        const hot: number[] = [];
        const apps: number[] = [];
        for (const tone of ["tool", "memory", "wallet", "skill"] as const) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = FILL[tone];
          ctx.beginPath();
          nodes.forEach((n, i) => {
            if (n.tone !== tone || !seen(n)) return;
            if ((focus && focus.has(i)) || R.on.has(i)) {
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
        nodes.forEach((n, i) => {
          if (n.tone === "app" && seen(n)) apps.push(i);
        });
        for (const i of apps) {
          const n = nodes[i];
          const r = Math.max(n.r, 1.2 / k);
          ctx.globalAlpha = 1;
          ctx.fillStyle = FILL.app;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = (focus && focus.has(i)) || R.on.has(i) ? "#F2F1EC" : APP_RING;
          ctx.lineWidth = 1 / k;
          ctx.stroke();
          const img = n.app ? logos.get(n.app) : undefined;
          if (img && r * k > 4) {
            const s2 = r * 1.15;
            ctx.drawImage(img, n.x - s2 / 2, n.y - s2 / 2, s2, s2);
          }
        }
        ctx.globalAlpha = 1;
        for (const i of hot) {
          const n = nodes[i];
          if (n.tone === "app") continue;
          ctx.fillStyle = FILL[n.tone as Exclude<Tone, "mind">];
          ctx.beginPath();
          ctx.arc(n.x, n.y, Math.max(n.r, 0.9 / k), 0, Math.PI * 2);
          ctx.fill();
          if (focus && focus.has(i)) {
            ctx.strokeStyle = "#F2F1EC";
            ctx.lineWidth = 1.4 / k;
            ctx.stroke();
          }
        }
        // Penny's trail: a thin blue ring around what this run used
        ctx.strokeStyle = INFO;
        ctx.lineWidth = 1.4 / k;
        ctx.globalAlpha = R.running ? 0.9 : 0.55;
        for (const i of R.trail) {
          if (R.on.has(i)) continue;
          const n = nodes[i];
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 3 / k, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // The Minds, as in Ancung's app: the profile picture in a circle with a light ring.
        nodes.forEach((n, i) => {
          if (n.kind !== "mind" || !seen(n)) return;
          const r = Math.max(n.r, 1.5 / k);
          ctx.globalAlpha = 1;
          const img = pics[n.c % pics.length];
          ctx.save();
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = "#F2F1EC";
          ctx.fill();
          if (r * k > 4 && img) {
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
          const px = (n.kind === "mind" ? (mine ? 14 : 12) : n.tone === "tool" ? 10 : 11) / k;
          ctx.font = `${n.kind === "mind" ? 600 : 500} ${px}px ${font}`;
          ctx.globalAlpha = a;
          ctx.strokeStyle = NIGHT;
          ctx.lineWidth = 4 / k;
          const y = n.y + n.r + 4 / k;
          ctx.strokeText(n.label, n.x, y);
          ctx.fillStyle = n.kind === "mind" || i === hover ? "#F2F1EC" : n.tone === "tool" ? "#8E8B83" : "#A6A39B";
          ctx.fillText(n.label, n.x, y);
        });
        ctx.globalAlpha = 1;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(layer, 0, 0);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w / 2 + view.x), dpr * (h / 2 + view.y));
      // The torch: the lines near the cursor catch a lime light that fades with distance.
      if (tp && !still) {
        const reach = TORCH / k;
        const g = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, reach);
        g.addColorStop(0, LIME);
        g.addColorStop(1, `${LIME}00`);
        ctx.save();
        ctx.strokeStyle = g;
        ctx.lineWidth = 2 / k;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        for (const l of links) {
          const a = nodes[l.a];
          const b = nodes[l.b];
          // only lines whose box comes within reach, then the exact distance
          if (Math.min(a.x, b.x) > tp.x + reach || Math.max(a.x, b.x) < tp.x - reach || Math.min(a.y, b.y) > tp.y + reach || Math.max(a.y, b.y) < tp.y - reach) continue;
          const ex = b.x - a.x;
          const ey = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((tp.x - a.x) * ex + (tp.y - a.y) * ey) / (ex * ex + ey * ey || 1)));
          if (Math.hypot(tp.x - (a.x + ex * t), tp.y - (a.y + ey * t)) > reach) continue;
          // drawn over the bubbles, so it stops at their edges
          const len = Math.hypot(ex, ey);
          if (len <= a.r + b.r) continue;
          ctx.moveTo(a.x + (ex / len) * a.r, a.y + (ey / len) * a.r);
          ctx.lineTo(b.x - (ex / len) * b.r, b.y - (ey / len) * b.r);
        }
        ctx.stroke();
        ctx.restore();
      }
      // dots running from Penny to the node at work
      if (!still)
        for (const [id, st] of R.on) {
          const p = pathTo(id);
          ctx.fillStyle = st.wait ? AMBER : INFO;
          for (let i = 0; i < p.length - 1; i++) {
            const a = nodes[p[i]];
            const b = nodes[p[i + 1]];
            for (let j = 0; j < 3; j++) {
              const q = (now / (st.wait ? 1800 : 900) + j / 3 + i * 0.17) % 1;
              ctx.globalAlpha = Math.sin(q * Math.PI);
              ctx.beginPath();
              ctx.arc(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q, 2.2 / k, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      // Penny's working node: a soft halo and a ring that grows and fades, then the bubble again.
      if (!still)
        for (const [i, st] of R.on) {
          const n = nodes[i];
          // a soft halo, then a ring that grows and fades
          const loop = st.wait ? 0.5 + 0.5 * Math.sin(now / 400) : ((now - st.at) % 1200) / 1200;
          const c = st.wait ? AMBER : INFO;
          ctx.fillStyle = c;
          ctx.globalAlpha = 0.18;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = c;
          ctx.lineWidth = 1.6 / k;
          ctx.globalAlpha = 0.8 * (1 - loop);
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 3 + loop * 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          if (n.tone === "app" || n.tone === "mind") continue;
          ctx.fillStyle = FILL[n.tone];
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fill();
        }

      for (const [i, o] of magnet) {
        nodes[i].x -= o.x;
        nodes[i].y -= o.y;
      }
    };

    let frame = 0;
    const loop = (now: number) => {
      if (sliced && warm < WARM) {
        const t0 = performance.now();
        while (warm < WARM && performance.now() - t0 < 8) {
          tick(nodes, links, Math.max(0.15, 1 - warm / WARM), labelK);
          warm++;
        }
      }
      // phones draw every other frame unless someone is touching the graph
      if (visible && !document.hidden && (!phone || drag || pts.size || (frame & 1) === 0)) draw(now);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    // ---- Penny's run while in view -----
    const apply = (i: number) => {
      const R = run.current;
      R.ver++;
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
    // Touch: without Explore a tap opens a card and anything else scrolls the page (touch-action
    // pan-y); with Explore one finger drags a bubble or the view and two fingers zoom.
    let drag: { id: number; x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; k: number } | null = null;
    let tap: { x: number; y: number } | null = null;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const twoFinger = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };
    const down = (e: PointerEvent) => {
      const p = local(e);
      if (e.pointerType === "touch" && !exploreRef.current) {
        tap = p;
        return;
      }
      if (e.pointerType === "touch") {
        pts.set(e.pointerId, p);
        if (pts.size === 2) {
          // a second finger: stop dragging, start zooming
          if (drag && drag.id >= 0) nodes[drag.id].pinned = false;
          drag = null;
          pinch = { d: twoFinger().d, k: view.k };
          return;
        }
        if (pts.size > 2) return;
      }
      const id = hit(p.x, p.y);
      drag = { id, x: p.x, y: p.y, vx: view.x, vy: view.y, moved: false };
      if (id >= 0) nodes[id].pinned = true;
      cv.setPointerCapture(e.pointerId);
      cv.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (e.pointerType === "touch") {
        if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > 8) tap = null;
        if (!exploreRef.current) return;
        if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
        if (pinch && pts.size >= 2) {
          const t = twoFinger();
          zoomAt(t.mx, t.my, (pinch.k * (t.d / pinch.d)) / view.k);
          return;
        }
      }
      if (e.pointerType !== "touch") torch = p;
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
    const up = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (!exploreRef.current) {
          if (tap && e.type === "pointerup") {
            const id = hit(tap.x, tap.y);
            pickRef.current(id >= 0 && id !== selected ? id : -1);
          }
          tap = null;
          return;
        }
      }
      if (!drag) return;
      if (drag.id >= 0) {
        nodes[drag.id].pinned = false;
        alpha = Math.max(alpha, 0.5);
      }
      // a click (no drag) opens the bubble's card, or closes it on the background / the same bubble
      if (!drag.moved && e.type === "pointerup") pickRef.current(drag.id >= 0 && drag.id !== selected ? drag.id : -1);
      drag = null;
      cv.style.cursor = hover >= 0 ? "grab" : "default";
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") pickRef.current(-1);
    };
    window.addEventListener("keydown", esc);
    const leave = () => {
      torch = null;
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
      worker?.terminate();
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
        className={`graph-fade absolute inset-0 size-full ${explore ? "touch-none" : "touch-pan-y"}`}
      />
      {/* The app logos, hidden: turned into images for the canvas. */}
      <div ref={logoBox} hidden aria-hidden="true">
        {Object.entries(APPS).map(([key, [Logo]]) => (
          <span key={key} data-app={key}>
            <Logo />
          </span>
        ))}
      </div>
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
        {/* touch screens: explore mode on and off */}
        <button
          type="button"
          onClick={() => setExplore((x) => !x)}
          className={`btn-swipe glass-dark relative h-10 whitespace-nowrap rounded-full px-4 text-[13px] font-medium text-[#F2F1EC] [@media(pointer:fine)]:hidden ${explore ? "!bg-[#D8F04A] !text-[#161614]" : ""}`}
        >
          {explore ? "Done" : "Explore"}
        </button>
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
              className="btn-swipe relative grid size-8 place-items-center rounded-full text-[17px] leading-none"
            >
              {t as string}
            </button>
          ))}
          <button type="button" onClick={() => api.current?.reset()} className="btn-swipe relative h-8 rounded-full px-3">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
