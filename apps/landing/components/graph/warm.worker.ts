// Settles the Mind Graph's layout off the main thread: builds the same seeded world as the page,
// runs the warm-up ticks and sends back every node's position. On a slow laptop these ticks took
// seconds of main-thread time while the page scrolled toward the graph.

import { buildWorld, tick } from "./world";

self.onmessage = (e: MessageEvent<{ count: number; labelK: number; ticks: number }>) => {
  const { count, labelK, ticks } = e.data;
  const { nodes, links } = buildWorld(count);
  for (let i = 0; i < ticks; i++) tick(nodes, links, Math.max(0.15, 1 - i / ticks), labelK);
  const xy = new Float32Array(nodes.length * 2);
  nodes.forEach((n, i) => {
    xy[i * 2] = n.x;
    xy[i * 2 + 1] = n.y;
  });
  (self as unknown as Worker).postMessage(xy, [xy.buffer]);
};
