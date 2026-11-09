// Each kind of block has its own colour, on its icon tile in the Builder's palette, on the canvas,
// in its settings, and in a job's steps on Autopilot (design B1.0: Start neutral, Ask the Mind's
// own colour, tools info blue, If warning amber; Ancung, 9 Nov: every kind different, so the
// website block takes the design's "app" purple). Green and red stay for run results, and lime
// stays the one brand accent.

export type Tone = "start" | "agent" | "tool" | "if" | "http"

export const TONE: Record<Tone, string> = {
  start: "bg-muted text-foreground",
  agent: "bg-node-mind text-primary-foreground",
  tool: "bg-info-soft text-info",
  if: "bg-warning-soft text-warning",
  http: "bg-node-app/15 text-node-app",
}

/** The tone of a saved canvas node, by its type. */
export const TONE_OF_NODE: Record<"trigger" | "agent" | "tool" | "http" | "condition", Tone> = {
  trigger: "start",
  agent: "agent",
  tool: "tool",
  http: "http",
  condition: "if",
}
