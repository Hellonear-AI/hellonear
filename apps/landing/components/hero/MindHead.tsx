"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

// The three hero styles. Each one pairs a face with a hand pose (see Hero.tsx).
export type MindStyle = "idle" | "wave" | "tap";

type Props = {
  style: MindStyle;
  onPoke: () => void;
  className?: string;
};

// Morph targets (design/hellonear-assets/3d-mv/fix_eyes.py):
// pupils and shines: look_x+, look_x-, look_up, look_down, small;
// lids: lid_00 .. lid_10, the lid line from fully open to closed, each step computed on the curved
// face. Only the two steps around the wanted lid line are mixed, so the lid never cuts through the eye.
type EyeMesh = THREE.Mesh & { morphTargetDictionary: Record<string, number>; morphTargetInfluences: number[] };

const LOOK_TURN = { yaw: 0.38, pitch: 0.16 }; // head turn toward the cursor, radians
const EASE = 0.08; // how fast the head follows (per frame, 0 to 1)
const LID_STEPS = [1.0, 0.7, 0.4, 0.15, -0.1, -0.3, -0.5, -0.7, -0.9, -1.1, -1.3]; // same as fix_eyes.py
const LID = { deadpan: -0.1, wide: 0.85, closed: -1.3 };
const BLINK = { close: 0.07, hold: 0.03, open: 0.13 }; // seconds: fast down, slower up

export function MindHead({ style, onPoke, className }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const styleRef = useRef(style);
  const pokeRef = useRef(onPoke);
  const [ready, setReady] = useState(false);

  styleRef.current = style;
  pokeRef.current = onPoke;

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 50);

    // Soft studio light from the upper left, like the 2D art.
    // Sun from the left (like the sky's sun in the top-left corner); low fill so the right side falls
    // into a real shadow and the head reads with contrast.
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a5a2a, 0.9));
    const key = new THREE.DirectionalLight(0xfff0d4, 4.6);
    key.position.set(-4.5, 2.6, 2.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfe0ff, 0.6); // cool sky bounce from behind on the right
    rim.position.set(3, 1.5, -2.5);
    scene.add(rim);

    const head = new THREE.Group();
    scene.add(head);

    const pupils: EyeMesh[] = []; // pupils and shines (look and size morphs)
    const lids: EyeMesh[] = [];
    const shines: THREE.Object3D[] = [];
    const eyeParts: THREE.Object3D[] = []; // whites, pupils, lids, shines: hidden for the happy arcs
    const arcsUp: THREE.Object3D[] = [];
    let root: THREE.Object3D | null = null;
    let headH = 1;
    let pivotY = 0;

    const draco = new DRACOLoader().setDecoderPath("/draco/");
    const loader = new GLTFLoader().setDRACOLoader(draco);
    let disposed = false;

    loader.load("/hero/mind-head.glb", (gltf) => {
      if (disposed) return;
      root = gltf.scene;
      root.traverse((o) => {
        const n = o.name;
        const m = o as EyeMesh;
        if (m.isMesh && m.morphTargetDictionary) {
          if (/^Face_Lid/.test(n)) lids.push(m);
          else pupils.push(m);
        }
        if (/^Face_Shine/.test(n)) shines.push(o);
        if (/^Face_(White|Pupil|Lid|Shine)/.test(n)) eyeParts.push(o);
        if (/^Face_Arc_Up/.test(n)) arcsUp.push(o);
        if (/^Face_Arc/.test(n)) o.visible = false;
      });
      // Turn around the neck pivot (the GLB node "MindHead"), framed to fill the canvas.
      const pivot = new THREE.Vector3();
      (root.getObjectByName("MindHead") ?? root).getWorldPosition(pivot);
      root.position.sub(pivot);
      head.position.copy(pivot);
      pivotY = pivot.y;
      head.updateMatrix(); // place the head before framing; from here on the tick composes its matrix
      head.matrixAutoUpdate = false; // composed by hand each frame (squash, stretch and skew)
      head.add(root);
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      headH = size.y;
      const centre = box.getCenter(new THREE.Vector3());
      const dist = (Math.max(size.x, size.y) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.12;
      camera.position.set(centre.x, centre.y, centre.z + dist);
      camera.lookAt(centre);
      setReady(true);
    });

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Cursor position, -1..1 around the head's centre on screen.
    const target = { x: 0.35, y: 0.2 };
    const cur = { x: 0.35, y: 0.2 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      target.x = THREE.MathUtils.clamp((e.clientX - cx) / (window.innerWidth / 2), -1, 1);
      target.y = THREE.MathUtils.clamp((e.clientY - cy) / (window.innerHeight / 2), -1, 1);
      lastMove = (performance.now() - t0) / 1000;
    };
    if (!reduced) window.addEventListener("pointermove", onMove, { passive: true });

    // Click on the head (not the empty canvas corners) changes the style.
    const ray = new THREE.Raycaster();
    const onClick = (e: MouseEvent) => {
      if (!root) return;
      const r = el.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, camera);
      if (ray.intersectObject(root, true).length) pokeRef.current();
    };
    el.addEventListener("click", onClick);

    const setMorph = (name: string, v: number) => {
      for (const m of pupils) {
        const i = m.morphTargetDictionary[name];
        if (i !== undefined) m.morphTargetInfluences[i] += (v - m.morphTargetInfluences[i]) * 0.25;
      }
    };
    // Put the lid line at L by mixing the two neighbouring lid steps.
    const setLid = (L: number) => {
      const c = THREE.MathUtils.clamp(L, LID.closed, LID_STEPS[0]);
      let i = 0;
      while (i < LID_STEPS.length - 2 && c < LID_STEPS[i + 1]) i++;
      const t = (LID_STEPS[i] - c) / (LID_STEPS[i] - LID_STEPS[i + 1]);
      for (const m of lids) {
        const inf = m.morphTargetInfluences;
        inf.fill(0);
        inf[m.morphTargetDictionary[`lid_${String(i).padStart(2, "0")}`]] = 1 - t;
        inf[m.morphTargetDictionary[`lid_${String(i + 1).padStart(2, "0")}`]] = t;
      }
    };

    let visible = true;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(el);

    // Eye life: blinks (sometimes double), small glances when the cursor rests, a blink on style change.
    let lid = LID.deadpan;
    let blinkStart = -1;
    let blinksLeft = 0;
    let nextBlink = 2.2;
    let lastMove = 0;
    let glance = { x: 0, y: 0 };
    let nextGlance = 3;
    let lastStyle = styleRef.current;
    const blinkAmount = (dt: number) => {
      if (dt < BLINK.close) return Math.sin((dt / BLINK.close) * (Math.PI / 2)) ** 2;
      if (dt < BLINK.close + BLINK.hold) return 1;
      const o = (dt - BLINK.close - BLINK.hold) / BLINK.open;
      return o >= 1 ? 0 : 1 - o * o * (3 - 2 * o);
    };
    const startBlink = (t: number, count = 1) => {
      blinkStart = t;
      blinksLeft = count - 1;
    };
    let raf = 0;
    const t0 = performance.now();
    // Click reaction: springs for squash/stretch (sq), skew (sk) and a little hop.
    const SPRING = { k: 170, c: 9 };
    const sq = { x: 0, v: 0 };
    const sk = { x: 0, v: 0 };
    const hop = { x: 0, v: 0 };
    const step = (p: { x: number; v: number }, dt: number) => {
      for (let i = 0; i < 4; i++) {
        const h = dt / 4;
        p.v += (-SPRING.k * p.x - SPRING.c * p.v) * h;
        p.x += p.v * h;
      }
    };
    const shear = new THREE.Matrix4();
    let face: MindStyle = styleRef.current; // what the face shows; switches during the squash
    let faceAt = 0;
    let prevT = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || !root) return;
      const t = (now - t0) / 1000;
      const dt = Math.min(0.033, Math.max(0, t - prevT));
      prevT = t;
      const want = styleRef.current;
      if (want !== lastStyle) {
        lastStyle = want;
        if (!reduced) {
          sq.v -= 5.5; // squash down first, then the spring stretches it up
          sk.v += (Math.random() < 0.5 ? -1 : 1) * 4;
          hop.v += 1.4;
          startBlink(t);
          faceAt = t + 0.09;
        } else faceAt = t;
      }
      if (face !== lastStyle && t >= faceAt) face = lastStyle;
      const s = face;
      step(sq, dt);
      step(sk, dt);
      step(hop, dt);

      // Small glances when the cursor has been still for a while.
      if (t - lastMove > 1.2 && t > nextGlance && !reduced) {
        glance = { x: (Math.random() - 0.5) * 0.35, y: (Math.random() - 0.5) * 0.2 };
        nextGlance = t + 0.9 + Math.random() * 1.6;
      } else if (t - lastMove <= 1.2) {
        glance = { x: 0, y: 0 };
      }
      cur.x += (target.x + glance.x - cur.x) * EASE;
      cur.y += (target.y + glance.y - cur.y) * EASE;

      // Head turns a little toward the cursor; the eyes do the rest.
      head.rotation.y = cur.x * LOOK_TURN.yaw;
      head.rotation.x = cur.y * LOOK_TURN.pitch;
      head.rotation.z = s === "wave" ? Math.sin(now / 420) * 0.05 : 0;
      // Squash keeps the volume: taller means thinner. The head grows from the neck pivot.
      const sy = 1 + sq.x * 0.5;
      const sxz = 1 - sq.x * 0.25;
      head.scale.set(sxz, sy, sxz);
      head.position.y = pivotY + Math.max(0, hop.x) * headH * 0.05;
      head.updateMatrix();
      shear.set(1, sk.x * 0.09, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1); // x leans with height
      head.matrix.multiply(shear);
      head.matrixWorldNeedsUpdate = true;

      setMorph("look_x+", Math.max(0, cur.x));
      setMorph("look_x-", Math.max(0, -cur.x));
      setMorph("look_down", Math.max(0, cur.y));
      setMorph("look_up", Math.max(0, -cur.y));
      setMorph("small", s === "tap" ? 1 : 0);

      // Happy face: eyes become upward arcs. Wide eyes (tap) have no highlight.
      const happy = s === "wave";
      for (const o of eyeParts) o.visible = !happy;
      for (const o of arcsUp) o.visible = happy;
      for (const o of shines) o.visible = !happy && s !== "tap";

      // Lids: deadpan at rest, follow the gaze a little (lower when looking down), wide when surprised.
      // Lids: deadpan at rest, follow the gaze a little (lower when looking down), wide when surprised.
      const base = s === "tap" ? LID.wide : LID.deadpan - Math.max(0, cur.y) * 0.25 + Math.max(0, -cur.y) * 0.35;
      lid += (base - lid) * (s === "tap" ? 0.35 : 0.2);
      if (!reduced && !happy && blinkStart < 0 && t > nextBlink) {
        startBlink(t, Math.random() < 0.2 ? 2 : 1);
        nextBlink = t + 2.6 + Math.random() * 3;
      }
      let b = 0;
      if (blinkStart >= 0) {
        const dt = t - blinkStart;
        b = dt < 0 ? 0 : blinkAmount(dt);
        if (dt > BLINK.close + BLINK.hold + BLINK.open) {
          if (blinksLeft > 0) {
            blinksLeft--;
            blinkStart = t + 0.06;
          } else blinkStart = -1;
        }
      }
      setLid(lid + (LID.closed - lid) * b);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("click", onClick);
      draco.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className={className} style={{ position: "relative" }}>
      {/* First paint: a still render of the head, swapped for the 3D one once it loads. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero/head.webp"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-300"
        style={{ opacity: ready ? 0 : 1 }}
      />
      <div
        ref={mount}
        className="absolute inset-0 cursor-pointer [&>canvas]:h-full [&>canvas]:w-full"
        role="button"
        aria-label="Poke the Mind to change its pose"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pokeRef.current();
          }
        }}
      />
    </div>
  );
}
