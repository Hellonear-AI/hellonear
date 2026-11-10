// The Mind Graph's data types, as in apps/fe (src/modules/graph/data/graph.ts, PR #154).

export type NodeKind = "mind" | "skill" | "tool" | "app" | "wallet" | "memory" | "model" | "workflow";

/** What a node did last: running, then ok / error / denied, or waiting on the owner. */
export type NodeState = "running" | "ok" | "error" | "denied" | "waiting";

export type GraphNode = {
  id: string;
  kind: NodeKind;
  label: string;
  uses: number;
  state?: NodeState;
  app?: "gmail" | "googlecalendar" | "googlemeet" | "mail";
};

export type GraphLink = { source: string; target: string };
