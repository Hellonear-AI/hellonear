"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

// The rigged 3D Mind (design/hellonear-assets/3d-mv/build_rig_v4.py): head, face, beak and sprout,
// with clips "enter", "idle" and "hi". Its 3D hands are hidden: the page draws the hands as 2D images
// (relit to match) and moves them in step through onClip.
//
// The page adds the parts that follow the user: the head turns toward the cursor, the eyes look at
// it, the lids blink. A click on the head plays "hi" once, then the Mind goes back to "idle".

type EyeMesh = THREE.Mesh & { morphTargetDictionary: Record<string, number>; morphTargetInfluences: number[] };
type Clip = "enter" | "idle" | "hi";

const BACK = 0;
const PX_PER_UNIT = 860; // on-screen size of the Mind: 1 model unit = 860 CSS px (head about 760 px wide)
const W = 1240;
const H = 1000;
const CREST_IN_CANVAS = 0.82; // where the crest sits in the canvas, from the top
const CREST = new THREE.Vector3(0, 0.52, 0.3); // the crest point in the model (glTF, y up)

const LOOK = { yaw: 0.34, pitch: 0.14 };
const LID_STEPS = [1.0, 0.7, 0.4, 0.15, -0.1, -0.3, -0.5, -0.7, -0.9, -1.1, -1.3]; // fix_eyes.py
const LID = { deadpan: -0.1, closed: -1.3 };
const BLINK = { close: 0.07, hold: 0.03, open: 0.13 };

// Happy eyes (upward arcs) during "hi".
const HAPPY: [number, number] = [0.22, 1.45];

/** Rotate a node by an Euler given in the model's space, on top of its rest rotation. */
function makeTurner(node: THREE.Object3D, root: THREE.Object3D) {
  const rest = node.quaternion.clone();
  node.parent!.updateWorldMatrix(true, false);
  const rootInv = new THREE.Quaternion();
  root.getWorldQuaternion(rootInv).invert();
  const parentRest = new THREE.Quaternion();
  node.parent!.getWorldQuaternion(parentRest);
  parentRest.premultiply(rootInv);
  const parentInv = parentRest.clone().invert();
  const tmp = new THREE.Quaternion();
  return (r: THREE.Euler) => {
    tmp.setFromEuler(r);
    node.quaternion.copy(parentInv).multiply(tmp).multiply(parentRest).multiply(rest);
  };
}

export type MindClip = Clip;

/** onClip: called when a clip starts, so the page can move the 2D hands in step with the body. */
export function MindStage({ crestY, centerX, onClip }: { crestY: number; centerX: number; onClip?: (c: Clip) => void }) {
  const backRef = useRef<HTMLCanvasElement>(null);
  const [top, setTop] = useState<number | null>(null);
  const clipRef = useRef(onClip);
  clipRef.current = onClip;

  useEffect(() => {
    const back = backRef.current!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // the hero stage is scaled up on tall screens (Hero.tsx, up to 1.6x); render more pixels so it stays sharp
    const stageScale = Math.min(1.6, Math.max(1, window.innerHeight / 900));
    const dpr = Math.min(window.devicePixelRatio * stageScale, 2.5);
    const mk = (canvas: HTMLCanvasElement) => {
      const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
      r.setPixelRatio(dpr);
      r.setSize(W, H, false);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.6;
      return r;
    };
    const rBack = mk(back);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(22, W / H, 0.05, 50);
    // Sun from the left with a low fill, so the right side reads as shadow.
    const sun = new THREE.DirectionalLight(0xfff0d4, 4.6);
    sun.position.set(-4.5, 2.6, 2.2);
    const bounce = new THREE.DirectionalLight(0xbfe0ff, 0.6);
    bounce.position.set(3, 1.5, -2.5);
    for (const l of [new THREE.HemisphereLight(0xdfeeff, 0x4a5a2a, 0.9), sun, bounce]) {
      l.layers.enableAll();
      scene.add(l);
    }

    const draco = new DRACOLoader().setDecoderPath("/draco/");
    const loader = new GLTFLoader().setDRACOLoader(draco);
    let disposed = false;

    let model: THREE.Object3D | null = null;
    let headMesh: THREE.Object3D | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    const actions: Partial<Record<Clip, THREE.AnimationAction>> = {};
    let clip: Clip = "enter";
    let clipStart = 0;
    const pupils: EyeMesh[] = [];
    const lids: EyeMesh[] = [];
    const shines: THREE.Object3D[] = [];
    const eyeParts: THREE.Object3D[] = [];
    const arcsUp: THREE.Object3D[] = [];
    let turnHead: ((r: THREE.Euler) => void) | null = null;
    let bodyBone: THREE.Object3D | null = null;

    loader.load("/hero/mind.glb", (gltf) => {
      if (disposed) return;
      model = gltf.scene;
      scene.add(model);
      model.updateMatrixWorld(true);
      model.traverse((o) => {
        const n = o.name;
        o.layers.set(BACK);
        const m = o as EyeMesh;
        if (m.isMesh) m.frustumCulled = false; // skinned parts move far from their bind box
        if (n === "Head") headMesh = o;
        if (/^Hand_/.test(n)) o.visible = false; // the hands are 2D images on the page
        if (m.isMesh && m.morphTargetDictionary) {
          if (/^Face_Lid/.test(n)) lids.push(m);
          else pupils.push(m);
        }
        if (/^Face_Shine/.test(n)) shines.push(o);
        if (/^Face_(White|Pupil|Lid|Shine)/.test(n)) eyeParts.push(o);
        if (/^Face_Arc_Up/.test(n)) arcsUp.push(o);
        if (/^Face_Arc/.test(n)) o.visible = false;
      });
      const headBone = model.getObjectByName("head");
      bodyBone = model.getObjectByName("body") ?? null;
      bodyBone?.getWorldPosition(bodyRest);
      const box = new THREE.Box3().setFromObject(headMesh!);
      box.getCenter(headBox.c);
      const size = box.getSize(new THREE.Vector3());
      headBox.r.set(size.x * 0.48, size.y * 0.45);
      if (headBone) turnHead = makeTurner(headBone, model);

      mixer = new THREE.AnimationMixer(model);
      for (const c of gltf.animations) {
        const a = mixer.clipAction(c);
        if (c.name !== "idle") {
          a.setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
        }
        actions[c.name as Clip] = a;
      }
      mixer.addEventListener("finished", () => play("idle", 0.25));

      // Camera: straight on, scaled so 1 unit = PX_PER_UNIT px, crest at CREST_IN_CANVAS of the canvas.
      const dist = H / PX_PER_UNIT / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const camY = CREST.y + (CREST_IN_CANVAS - 0.5) * (H / PX_PER_UNIT);
      camera.position.set(0, camY, CREST.z + dist);
      camera.lookAt(0, camY, CREST.z);
      camera.updateMatrixWorld();
      const p = CREST.clone().project(camera);
      setTop(crestY - ((1 - p.y) / 2) * H);

      // The page loader (PageLoader) covers the hero until the assets are in; the Mind stays hidden and
      // its entrance waits for the loader to lift, so the visitor sees it climb up.
      const start = () => {
        if (disposed || !model) return;
        model.visible = true;
        if (reduced) play("idle", 0);
        else play("enter", 0);
      };
      model.visible = false;
      window.dispatchEvent(new Event("hn:mind-loaded"));
      if ((window as unknown as { __hnRevealed?: boolean }).__hnRevealed) start();
      else window.addEventListener("hn:reveal", start, { once: true });
    });

    const play = (name: Clip, fade: number) => {
      const next = actions[name];
      if (!next) return;
      const prev = actions[clip];
      next.reset().play();
      if (prev && prev !== next && fade > 0) prev.crossFadeTo(next, fade, false);
      else if (prev && prev !== next) prev.stop();
      clip = name;
      clipStart = clock.elapsedTime;
      clipRef.current?.(name);
    };

    // Cursor, -1..1 around the head.
    const target = { x: 0.3, y: 0.2 };
    const cur = { x: 0.3, y: 0.2 };
    let lastMove = 0;
    const onMove = (e: PointerEvent) => {
      const r = back.getBoundingClientRect();
      target.x = THREE.MathUtils.clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2), -1, 1);
      target.y = THREE.MathUtils.clamp((e.clientY - (r.top + r.height * 0.45)) / (window.innerHeight / 2), -1, 1);
      lastMove = clock.elapsedTime;
    };
    if (!reduced) window.addEventListener("pointermove", onMove, { passive: true });

    // A click on the head says "hi" (links and buttons keep working). Raycasting skinned meshes is not
    // reliable here, so the head is an ellipse: its rest box, moved with the body bone.
    const headBox = { c: new THREE.Vector3(), r: new THREE.Vector2() };
    const bodyRest = new THREE.Vector3();
    const tmpV = new THREE.Vector3();
    const hitsHead = (x: number, y: number) => {
      if (!headMesh || !bodyBone) return false;
      const rect = back.getBoundingClientRect();
      bodyBone.getWorldPosition(tmpV).sub(bodyRest).add(headBox.c).project(camera);
      const cx = rect.left + ((tmpV.x + 1) / 2) * rect.width;
      const cy = rect.top + ((1 - tmpV.y) / 2) * rect.height;
      const dx = (x - cx) / (headBox.r.x * PX_PER_UNIT);
      const dy = (y - cy) / (headBox.r.y * PX_PER_UNIT);
      return dx * dx + dy * dy < 1;
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element).closest("a, button")) return;
      if (hitsHead(e.clientX, e.clientY) && clip !== "enter") play("hi", 0.12);
    };
    let overHead = false;
    const onHover = (e: PointerEvent) => {
      const now = !(e.target as Element).closest("a, button") && hitsHead(e.clientX, e.clientY);
      if (now !== overHead) {
        overHead = now;
        document.documentElement.style.cursor = now ? "pointer" : "";
      }
    };
    window.addEventListener("click", onClick);
    window.addEventListener("pointermove", onHover, { passive: true });

    const setMorph = (name: string, v: number) => {
      for (const m of pupils) {
        const i = m.morphTargetDictionary[name];
        if (i !== undefined) m.morphTargetInfluences[i] += (v - m.morphTargetInfluences[i]) * 0.25;
      }
    };
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
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(back);

    const clock = new THREE.Clock();
    let lid = LID.deadpan;
    let blinkStart = -1;
    let blinksLeft = 0;
    let nextBlink = 3;
    let glance = { x: 0, y: 0 };
    let nextGlance = 3;
    const blinkAmount = (dt: number) => {
      if (dt < BLINK.close) return Math.sin((dt / BLINK.close) * (Math.PI / 2)) ** 2;
      if (dt < BLINK.close + BLINK.hold) return 1;
      const o = (dt - BLINK.close - BLINK.hold) / BLINK.open;
      return o >= 1 ? 0 : 1 - o * o * (3 - 2 * o);
    };
    const e = new THREE.Euler();

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      if (!visible || !mixer || !model) return;
      mixer.update(dt);
      const ct = t - clipStart;

      // Look toward the cursor, with small glances when it rests.
      if (t - lastMove > 1.2 && t > nextGlance && !reduced) {
        glance = { x: (Math.random() - 0.5) * 0.35, y: (Math.random() - 0.5) * 0.2 };
        nextGlance = t + 0.9 + Math.random() * 1.6;
      } else if (t - lastMove <= 1.2) glance = { x: 0, y: 0 };
      cur.x += (target.x + glance.x - cur.x) * 0.08;
      cur.y += (target.y + glance.y - cur.y) * 0.08;
      turnHead?.(e.set(cur.y * LOOK.pitch, cur.x * LOOK.yaw, 0));
      setMorph("look_x+", Math.max(0, cur.x));
      setMorph("look_x-", Math.max(0, -cur.x));
      setMorph("look_down", Math.max(0, cur.y));
      setMorph("look_up", Math.max(0, -cur.y));

      // Face: happy arcs during "hi"; otherwise deadpan lids that follow the gaze and blink.
      const happy = clip === "hi" && ct > HAPPY[0] && ct < HAPPY[1];
      for (const o of eyeParts) o.visible = !happy;
      for (const o of arcsUp) o.visible = happy;
      for (const o of shines) o.visible = !happy;
      const base = LID.deadpan - Math.max(0, cur.y) * 0.25 + Math.max(0, -cur.y) * 0.35;
      lid += (base - lid) * 0.2;
      if (!reduced && !happy && blinkStart < 0 && t > nextBlink) {
        blinkStart = t;
        blinksLeft = Math.random() < 0.2 ? 1 : 0;
        nextBlink = t + 2.6 + Math.random() * 3;
      }
      let b = 0;
      if (blinkStart >= 0) {
        const d = t - blinkStart;
        b = d < 0 ? 0 : blinkAmount(d);
        if (d > BLINK.close + BLINK.hold + BLINK.open) {
          if (blinksLeft > 0) {
            blinksLeft--;
            blinkStart = t + 0.06;
          } else blinkStart = -1;
        }
      }
      // During the entrance the eyes open wide once the head is up, then settle.
      setLid(lid + (LID.closed - lid) * b);

      rBack.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointermove", onHover);
      window.removeEventListener("click", onClick);
      document.documentElement.style.cursor = "";
      draco.dispose();
      rBack.dispose();
    };
  }, [crestY]);

  const pos: React.CSSProperties = {
    position: "absolute",
    left: centerX - W / 2,
    top: top ?? crestY - H * CREST_IN_CANVAS,
    width: W,
    height: H,
    pointerEvents: "none",
  };
  return (
    <>
      <canvas ref={backRef} aria-hidden="true" style={{ ...pos, zIndex: 1 }} />

    </>
  );
}
