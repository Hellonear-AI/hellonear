import type { NodeKind } from "@/modules/graph/data/graph"

// The live view draws on a canvas, so it reads the design tokens (`--node-*` and friends) as
// colours from CSS, again whenever the theme changes.

export type Colors = Record<
  "fg" | "muted" | "faint" | "line" | "glow" | "surface" | "bg" | "info" | "success" | "danger" | "warning" | "mind" | "skill" | "tool" | "app" | "wallet" | "memory" | "model",
  string
>

const VAR: Record<keyof Colors, string> = {
  fg: "--foreground",
  muted: "--muted-foreground",
  faint: "--tertiary-foreground",
  line: "--border-strong",
  // The one accent (lime in dark mode, its deep olive in light), for the hover glow.
  glow: "--focus",
  surface: "--surface",
  bg: "--background",
  info: "--info",
  success: "--success",
  danger: "--danger",
  warning: "--warning",
  mind: "--node-mind",
  skill: "--node-skill",
  tool: "--node-tool",
  app: "--node-app",
  wallet: "--node-wallet",
  memory: "--node-memory",
  model: "--node-model",
}

export function readColors(): Colors {
  const css = getComputedStyle(document.documentElement)
  return Object.fromEntries(Object.entries(VAR).map(([k, v]) => [k, css.getPropertyValue(v).trim() || "#888"])) as Colors
}

export const FILL: Record<NodeKind, keyof Colors> = { mind: "mind", skill: "skill", tool: "tool", app: "surface", wallet: "wallet", memory: "memory", model: "model", workflow: "model" }
