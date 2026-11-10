"use client";

import { useEffect, useRef } from "react";

// The approval/Tricked photo, brought to life in WebGL without moving it: the grass sways in a soft
// wind (a small, noisy displacement of the image), a gust of light rolls across, and the dappled leaf
// light flickers as if the leaves above were moving. The Mind (low-saturation pixels, and an ellipse
// around it) is masked out, so it stays perfectly still and sharp. The plain <img> stays underneath
// as the fallback; the canvas fades in once the texture is ready. Paused off-screen; off for reduced
// motion.

const VERT = `attribute vec2 p; varying vec2 uv;
void main(){ uv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`;

const FRAG = `precision highp float;
varying vec2 uv; uniform sampler2D img; uniform float t; uniform vec2 texel;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec4 c0 = texture2D(img, uv);
  float sat = max(c0.r, max(c0.g, c0.b)) - min(c0.r, min(c0.g, c0.b));
  // the Mind: grey pixels, inside an ellipse around it
  vec2 e = (uv - vec2(.385, .47)) / vec2(.095, .25);
  float mind = (1. - smoothstep(.85, 1.05, length(e))) * (1. - smoothstep(.05, .14, sat));
  float m = smoothstep(.06, .16, sat) * (1. - mind) * (1. - (1. - smoothstep(.75, 1., length(e))) * .85);
  // wind: long waves rolling across, plus fine jitter for the blades
  float gust = .5 + .5 * sin(dot(uv, vec2(7., 3.)) * 3.1 - t * 1.1);
  vec2 d = vec2(sin(uv.y * 900. + t * 2.6 + n(uv * 40.) * 6.), cos(uv.x * 700. + t * 2.1)) * .5;
  d += (vec2(n(uv * vec2(90., 60.) + t * .9), n(uv * vec2(90., 60.) + 13. - t * .8)) - .5) * 1.6;
  d *= (.55 + .9 * gust);
  // the leaves in the top corners move more
  float leaves = smoothstep(.75, .95, 1. - uv.y) * (smoothstep(.12, 0., uv.x) + smoothstep(.86, 1., uv.x));
  d *= 1. + leaves * 2.5;
  vec3 c = texture2D(img, uv + d * texel * 2.2 * m).rgb;
  // dappled light flickers (leaves moving above), and a soft gust of light rolls by
  float flick = n(uv * vec2(14., 7.) + vec2(t * .18, t * .11)) - .5;
  c *= 1. + m * (flick * .09 + (gust - .5) * .035);
  gl_FragColor = vec4(mix(c0.rgb, c, m), 1.);
}`;

export function LivingPhoto({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const gl = cv.getContext("webgl", { premultipliedAlpha: false, antialias: false });
    if (!gl) return;
    let disposed = false;
    const sh = (type: number, s: string) => {
      const o = gl.createShader(type)!;
      gl.shaderSource(o, s);
      gl.compileShader(o);
      return o;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uT = gl.getUniformLocation(prog, "t");
    const uTexel = gl.getUniformLocation(prog, "texel");

    let ready = false;
    const im = new Image();
    im.decoding = "async";
    im.src = src;
    im.onload = () => {
      if (disposed) return;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
      gl.uniform2f(uTexel, 1 / im.naturalWidth, 1 / im.naturalHeight);
      ready = true;
    };

    // Size the canvas to what is actually on screen (the stage is scaled with a transform).
    let frame = 0;
    const fit = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.min(4096, Math.round(r.width * dpr));
      const h = Math.round((w * cv.clientHeight) / Math.max(1, cv.clientWidth));
      if (Math.abs(w - cv.width) > cv.width * 0.08 || !cv.width) {
        cv.width = w;
        cv.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(cv);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || !ready) return;
      if (frame++ % 20 === 0) fit();
      gl.useProgram(prog);
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (cv.style.opacity !== "1") cv.style.opacity = "1";
    };
    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [src]);

  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="absolute inset-0 h-full w-full" />
      <canvas ref={canvas} className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-500" aria-hidden="true" />
    </div>
  );
}
