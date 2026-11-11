"use client";

import { useEffect, useRef } from "react";

// The front grass slope, drawn with WebGL so the wind can move it:
// - blade tips along the top edge sway (pixels near the edge are shifted sideways, the ground stays put);
// - a gust, a soft band of light, sweeps across the field every few seconds.
// The image is drawn twice, the second copy mirrored, so the crest turns into a hilltop on wide screens.
// Reduced motion: drawn once, no wind.

const VERT = `
attribute vec2 p;
varying vec2 uv;
void main() {
  uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D tex;
uniform float t;
uniform float wind;
varying vec2 uv;
void main() {
  // Two copies side by side; the right one mirrored.
  float x = uv.x < 0.5 ? uv.x * 2.0 : 2.0 - uv.x * 2.0;
  vec2 st = vec2(x, uv.y);
  // How close this pixel is to the grass top: the pixel a little above it is empty there.
  float above = texture2D(tex, st - vec2(0.0, 0.07)).a;
  float tip = 1.0 - above;
  // Gust: a slow wave of stronger wind travelling left to right.
  float gx = fract(t * 0.045) * 1.8 - 0.4;
  float gust = exp(-pow((uv.x - gx) * 5.0, 2.0));
  float sway = sin(uv.x * 140.0 + t * 2.4) * 0.55 + sin(uv.x * 53.0 - t * 1.4) * 0.45;
  float off = (sway * (0.35 + gust) + gust * 1.4) * 0.0018 * tip * wind;
  vec4 c = texture2D(tex, st + vec2(off, 0.0));
  // The gust also lifts the light on the grass it passes over.
  float light = gust * c.a * (0.10 + 0.10 * tip) * wind;
  c.rgb += vec3(0.85, 1.0, 0.55) * light;
  gl_FragColor = c;
}`;

export function GrassSlope({ src, className, style }: { src: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sh = (type: number, code: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, code);
      gl.compileShader(s);
      return s;
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
    const uWind = gl.getUniformLocation(prog, "wind");

    let raf = 0;
    let disposed = false;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    const img = new Image();
    img.src = src;
    img.onload = () => {
      if (disposed) return; // React dev runs effects twice; only the live one draws
      // Grass art is about 2400 px wide; drawing at 1x CSS pixels keeps the canvas small.
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const t0 = performance.now();
      const draw = (now: number) => {
        gl.useProgram(prog);
        gl.uniform1f(uT, (now - t0) / 1000);
        gl.uniform1f(uWind, reduced ? 0 : 1);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      if (reduced) {
        draw(t0);
        return;
      }
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        if (visible) draw(now);
      };
      raf = requestAnimationFrame(tick);
    };

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [src]);

  return <canvas ref={ref} aria-hidden="true" className={className} style={style} />;
}
