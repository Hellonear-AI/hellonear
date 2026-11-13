// The diagrams on "How it works", drawn as SVG instead of Mermaid (Ancung, 13 Nov: the Mermaid flowchart
// shrank to unreadable text, worst on phones). Same parts, arrows and steps as the Mermaid diagrams they
// replace; nothing added. Like the app's Mind Graph: rounded nodes joined by curved, labelled links, with
// small dots travelling along them (style.css hides the dots for reduced motion). Desktop flows left to
// right; phones get the same parts top to bottom, so the text keeps its size. HelloNear's own parts are
// tinted (hn-ours), outside services plain; colours live in style.css, light and dark.

// A curved link from one side of a node to a side of another. Sides: l, r, t, b; f is where along the side
// (0 to 1, the middle by default). k1 and k2 set how far the curve leaves and enters (to route it around a
// group); t is where along it the label sits.
const anchor = (n, side, f = 0.5) =>
  side === "l" ? [n.x, n.y + n.h * f, -1, 0]
  : side === "r" ? [n.x + n.w, n.y + n.h * f, 1, 0]
  : side === "t" ? [n.x + n.w * f, n.y, 0, -1]
  : [n.x + n.w * f, n.y + n.h, 0, 1];

const link = (e, a, b) => {
  const [x1, y1, dx1, dy1] = anchor(a, e.fs, e.ff);
  const [x2, y2, dx2, dy2] = anchor(b, e.ts, e.tf);
  const k = Math.max(28, Math.hypot(x2 - x1, y2 - y1) * 0.4);
  const c1 = [x1 + dx1 * (e.k1 ?? k), y1 + dy1 * (e.k1 ?? k)];
  const c2 = [x2 + dx2 * (e.k2 ?? k), y2 + dy2 * (e.k2 ?? k)];
  const t = e.t ?? 0.5, u = 1 - t;
  const at = (p, q, r, s2) => u * u * u * p + 3 * u * u * t * q + 3 * u * t * t * r + t * t * t * s2;
  const mid = [at(x1, c1[0], c2[0], x2), at(y1, c1[1], c2[1], y2)];
  return { d: `M${x1},${y1} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${x2},${y2}`, mid, end: [x2, y2, dx2, dy2] };
};

const Node = ({ n }) => (
  <g>
    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="12" className={n.ours ? "hn-node hn-ours" : "hn-node"} />
    <text x={n.x + 14} y={n.y + (n.sub ? 22 : n.h / 2 + 4.5)} className="hn-title">
      {n.title}
    </text>
    {(n.sub || []).map((line, i) => (
      <text key={i} x={n.x + 14} y={n.y + 38 + i * 14} className={n.mono ? "hn-sub hn-mono" : "hn-sub"}>
        {line}
      </text>
    ))}
  </g>
);

const Edge = ({ e, nodes, i }) => {
  const { d, mid, end } = link(e, nodes[e.from], nodes[e.to]);
  const [x, y, dx, dy] = end;
  // An arrowhead pointing into the target side.
  const ax = -dx, ay = -dy, px = -ay, py = ax;
  const head = `M${x + dx * 7 + px * 4},${y + dy * 7 + py * 4} L${x},${y} L${x + dx * 7 - px * 4},${y + dy * 7 - py * 4}`;
  const w = e.label ? e.label.length * 5.6 + 12 : 0;
  return (
    <g>
      <path d={d} className={e.dashed ? "hn-edge hn-dashed" : "hn-edge"} />
      <path d={head} className="hn-head" />
      {e.dashed ? null : (
        <circle r="2.6" className="hn-dot">
          <animateMotion dur={`${2.6 + (i % 4) * 0.35}s`} begin={`${(i * 0.45) % 2.4}s`} repeatCount="indefinite" path={d} />
        </circle>
      )}
      {e.label ? (
        <g>
          <rect x={mid[0] - w / 2} y={mid[1] - 9} width={w} height="18" rx="9" className="hn-pill" />
          <text x={mid[0]} y={mid[1] + 3.5} textAnchor="middle" className="hn-label">
            {e.label}
          </text>
        </g>
      ) : null}
    </g>
  );
};

const Group = ({ g }) => (
  <g>
    <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="16" className="hn-group" />
    <text x={g.end ? g.x + g.w - 14 : g.x + 14} y={g.y + 20} textAnchor={g.end ? "end" : "start"} className="hn-glabel">
      {g.label}
    </text>
  </g>
);

const Canvas = ({ width, height, nodes, edges, groups, label, className }) => (
  <svg viewBox={`0 0 ${width} ${height}`} className={`hn-canvas ${className}`} role="img" aria-label={label}>
    {(groups || []).map((g, i) => <Group key={i} g={g} />)}
    {edges.map((e, i) => <Edge key={i} e={e} nodes={nodes} i={i} />)}
    {Object.values(nodes).map((n, i) => <Node key={i} n={n} />)}
  </svg>
);

const ARCH_LABEL =
  "HelloNear's parts. The owner chats and approves in the web app or Telegram, which talk to the backend API; Meteor signs the wallet policy and Freeze on OutLayer. The backend sends each Mind's config and skills to the engine (Mastra): one generic Mind agent, 53 tools granted by equipped skills, and Builder workflows with Autopilot. The engine calls NEAR AI Cloud for every model call, NEAR Intents for dry quotes, Composio for apps, and NEAR RPC. The backend sends transfers to OutLayer, which checks the policy in a TEE and signs for NEAR testnet, uploads Intel quotes to Phala's TEE Explorer, and writes the Mind registry.";

export const Architecture = () => {
  // Desktop: left to right. The backend's own calls (OutLayer, Phala, the registry) sit in the bottom row and
  // their links dip under the engine instead of crossing it.
  const D = {
    web: { x: 0, y: 30, w: 132, h: 54, title: "Web app", sub: ["chat, approve"], ours: true },
    tg: { x: 0, y: 98, w: 132, h: 54, title: "Telegram bot", sub: ["chat, approve"], ours: true },
    meteor: { x: 0, y: 166, w: 132, h: 54, title: "Meteor wallet", sub: ["the owner signs"] },
    be: { x: 200, y: 64, w: 150, h: 70, title: "Backend API", sub: ["NEP-413 sign-in,", "runs, approvals"], ours: true },
    agent: { x: 445, y: 40, w: 150, h: 56, title: "Mind agent", sub: ["persona, memory, skills"], ours: true },
    tools: { x: 445, y: 110, w: 150, h: 56, title: "53 tools", sub: ["only equipped skills"], ours: true },
    wf: { x: 445, y: 180, w: 150, h: 56, title: "Workflows", sub: ["Builder, Autopilot"], ours: true },
    nai: { x: 670, y: 16, w: 150, h: 54, title: "NEAR AI Cloud", sub: ["TEE inference"] },
    intents: { x: 670, y: 82, w: 150, h: 54, title: "NEAR Intents", sub: ["1Click quotes"] },
    composio: { x: 670, y: 148, w: 150, h: 54, title: "Composio", sub: ["Gmail, Calendar, more"] },
    rpc: { x: 670, y: 214, w: 150, h: 54, title: "NEAR RPC", sub: ["view_account, tx"] },
    near: { x: 0, y: 344, w: 132, h: 54, title: "NEAR testnet", sub: ["signed transfers"] },
    ol: { x: 200, y: 336, w: 150, h: 70, title: "OutLayer", sub: ["policy checked", "in a TEE"] },
    phala: { x: 445, y: 336, w: 150, h: 70, title: "Phala TEE", sub: ["Explorer"] },
    reg: { x: 670, y: 336, w: 150, h: 70, title: "Mind registry", sub: ["hellonear-registry", ".testnet"], mono: true },
  };
  const E = [
    { from: "web", fs: "r", to: "be", ts: "l", tf: 0.35 },
    { from: "tg", fs: "r", to: "be", ts: "l", tf: 0.65 },
    { from: "be", fs: "r", ff: 0.35, to: "agent", ts: "l", label: "config + skills", t: 0.45 },
    { from: "tools", fs: "l", to: "be", ts: "r", tf: 0.75, label: "wallet routes", dashed: true, t: 0.5 },
    { from: "agent", fs: "b", to: "tools", ts: "t" },
    { from: "wf", fs: "t", to: "tools", ts: "b" },
    { from: "agent", fs: "r", to: "nai", ts: "l", label: "model calls" },
    { from: "tools", fs: "r", ff: 0.3, to: "intents", ts: "l", label: "dry quote" },
    { from: "tools", fs: "r", ff: 0.55, to: "composio", ts: "l" },
    { from: "tools", fs: "r", ff: 0.8, to: "rpc", ts: "l" },
    { from: "meteor", fs: "b", to: "ol", ts: "t", tf: 0.25, label: "policy, freeze", t: 0.45 },
    { from: "be", fs: "b", ff: 0.6, to: "ol", ts: "t", tf: 0.65, label: "transfer" },
    { from: "ol", fs: "l", to: "near", ts: "r" },
    { from: "be", fs: "b", ff: 0.85, to: "phala", ts: "t", k1: 170, k2: 40, label: "Intel quote", t: 0.72 },
    { from: "be", fs: "b", ff: 0.95, to: "reg", ts: "t", k1: 185, k2: 40, label: "registry", dashed: true, t: 0.8 },
  ];
  const DG = [{ x: 430, y: 0, w: 180, h: 250, label: "Engine (Mastra 1.81)" }];

  // Phones: the same parts top to bottom, two columns where they fit.
  const M = {
    web: { x: 0, y: 0, w: 108, h: 40, title: "Web app", ours: true },
    tg: { x: 122, y: 0, w: 108, h: 40, title: "Telegram", ours: true },
    meteor: { x: 244, y: 0, w: 116, h: 40, title: "Meteor" },
    be: { x: 50, y: 92, w: 180, h: 70, title: "Backend API", sub: ["NEP-413 sign-in,", "runs, approvals"], ours: true },
    agent: { x: 24, y: 244, w: 150, h: 56, title: "Mind agent", sub: ["persona, memory"], ours: true },
    tools: { x: 186, y: 244, w: 150, h: 56, title: "53 tools", sub: ["equipped skills"], ours: true },
    wf: { x: 186, y: 314, w: 150, h: 56, title: "Workflows", sub: ["Builder, Autopilot"], ours: true },
    nai: { x: 0, y: 432, w: 172, h: 54, title: "NEAR AI Cloud", sub: ["TEE inference"] },
    intents: { x: 188, y: 432, w: 172, h: 54, title: "NEAR Intents", sub: ["1Click quotes"] },
    composio: { x: 0, y: 498, w: 172, h: 54, title: "Composio", sub: ["Gmail, Calendar"] },
    rpc: { x: 188, y: 498, w: 172, h: 54, title: "NEAR RPC", sub: ["view_account, tx"] },
    ol: { x: 0, y: 610, w: 172, h: 54, title: "OutLayer", sub: ["policy signed in Meteor"] },
    near: { x: 188, y: 610, w: 172, h: 54, title: "NEAR testnet" },
    phala: { x: 0, y: 676, w: 172, h: 54, title: "Phala TEE", sub: ["Explorer"] },
    reg: { x: 188, y: 676, w: 172, h: 54, title: "Mind registry", sub: ["hellonear-registry"], mono: true },
  };
  const ME = [
    { from: "web", fs: "b", to: "be", ts: "t" },
    { from: "tg", fs: "b", to: "be", ts: "t", label: "chat, approve" },
    { from: "be", fs: "b", to: "agent", ts: "t", label: "config + skills" },
    { from: "agent", fs: "r", to: "tools", ts: "l" },
    { from: "wf", fs: "t", to: "tools", ts: "b" },
    { from: "agent", fs: "b", to: "nai", ts: "t", label: "model calls", t: 0.72 },
    { from: "tools", fs: "r", to: "intents", ts: "t", tf: 0.88, k1: 22, k2: 70 },
    { from: "ol", fs: "r", to: "near", ts: "l" },
  ];
  const MG = [
    { x: 10, y: 206, w: 340, h: 176, label: "Engine (Mastra 1.81)", end: true },
    { x: -6, y: 586, w: 372, h: 152, label: "Wallet, proofs and registry (from the backend)" },
  ];
  return (
    <div className="hn-diagram not-prose">
      <Canvas width={820} height={410} nodes={D} edges={E} groups={DG} label={ARCH_LABEL} className="hn-wide" />
      <Canvas width={360} height={740} nodes={M} edges={ME} groups={MG} label={ARCH_LABEL} className="hn-narrow" />
    </div>
  );
};

// "One payment, call by call": the Mermaid sequence diagram, drawn. Desktop: actor columns with arrows
// between them. Phones: the same steps as a timeline (six columns don't fit a phone's width).
const ACTORS = ["Owner", "Mind", "NEAR AI Cloud", "Backend", "OutLayer", "NEAR testnet"];
const STEPS = [
  { f: 0, t: 1, text: '"Pay 0.01 NEAR to alice.testnet"' },
  { f: 1, t: 2, text: "model call (streamed)" },
  { f: 2, t: 1, text: "tool call near_view_account", back: true },
  { f: 1, t: 5, text: "RPC view_account alice.testnet" },
  { f: 5, t: 1, text: "account exists", back: true },
  { f: 2, t: 1, text: "tool call send_payment", back: true },
  { note: 1, text: "requireApproval: the run pauses (unless an owner rule covers it)" },
  { f: 1, t: 0, text: "approval card: amount, recipient, checks", back: true },
  { f: 0, t: 3, text: "Approve" },
  { f: 3, t: 1, text: "resume the run" },
  { f: 1, t: 3, text: "/internal/v1/wallet/send_payment (wallet token)" },
  { f: 3, t: 4, text: "transfer request" },
  { alt: "Inside the policy" },
  { f: 4, t: 5, text: "signed transfer" },
  { f: 5, t: 4, text: "tx hash", back: true },
  { f: 4, t: 1, text: "sent + txHash", back: true },
  { alt: "Over the limit, not on the list, or frozen", bad: true },
  { f: 4, t: 1, text: "policy_denied / wallet_frozen, no tx", back: true, bad: true },
  { end: true },
  { f: 1, t: 0, text: 'receipt (or "refused before signing")', back: true },
  { f: 1, t: 2, text: "fetch signatures + attestation" },
  { note: 1, text: "run.verified: the badge shows only if every step matches the attested key" },
];

export const PaymentSteps = () => {
  const colX = (i) => 60 + i * 132;
  const top = 64;
  const row = 34;
  let y = top;
  const rows = STEPS.map((s) => {
    const r = { s, y };
    y += s.end ? 10 : s.alt ? 26 : row;
    return r;
  });
  const height = y + 20;
  let n = 0;
  return (
    <div className="hn-diagram not-prose">
      <svg viewBox={`0 0 780 ${height}`} className="hn-canvas hn-wide" role="img" aria-label="One payment, call by call: the steps listed below for phones and screen readers.">
        {ACTORS.map((a, i) => (
          <g key={a}>
            <line x1={colX(i)} y1={42} x2={colX(i)} y2={height - 6} className="hn-life" />
            <rect x={colX(i) - 56} y={6} width="112" height="34" rx="10" className={i === 1 || i === 3 ? "hn-node hn-ours" : "hn-node"} />
            <text x={colX(i)} y={27.5} textAnchor="middle" className="hn-title">
              {a}
            </text>
          </g>
        ))}
        {rows.map(({ s, y }, i) => {
          if (s.end) return null;
          if (s.alt)
            return (
              <text key={i} x={8} y={y + 16} className={s.bad ? "hn-alt hn-bad" : "hn-alt"}>
                {s.bad ? "Otherwise: " : ""}
                {s.alt}
              </text>
            );
          if (s.note !== undefined)
            return (
              <g key={i}>
                <rect x={colX(s.note) - 50} y={y + 3} width={560} height="22" rx="8" className="hn-note" />
                <text x={colX(s.note) - 38} y={y + 18} className="hn-notetext">
                  {s.text}
                </text>
              </g>
            );
          n += 1;
          const x1 = colX(s.f), x2 = colX(s.t), dir = x2 > x1 ? 1 : -1, yy = y + 20;
          return (
            <g key={i}>
              <line x1={x1} y1={yy} x2={x2 - dir * 2} y2={yy} className={`hn-edge ${s.back ? "hn-dashed" : ""} ${s.bad ? "hn-badline" : ""}`} />
              <path d={`M${x2 - dir * 8},${yy - 4} L${x2},${yy} L${x2 - dir * 8},${yy + 4}`} className={`hn-head ${s.bad ? "hn-badline" : ""}`} />
              <circle cx={x1} cy={yy} r="8" className="hn-num" />
              <text x={x1} y={yy + 3.5} textAnchor="middle" className="hn-numtext">
                {n}
              </text>
              <text x={(x1 + x2) / 2} y={yy - 11} textAnchor="middle" className="hn-label">
                {s.text}
              </text>
            </g>
          );
        })}
      </svg>
      <ol className="hn-narrow hn-steps">
        {STEPS.filter((s) => !s.end).map((s, i) =>
          s.alt ? (
            <li key={i} className={s.bad ? "hn-steps-alt hn-bad" : "hn-steps-alt"}>
              {s.bad ? "Otherwise: " : ""}
              {s.alt}
            </li>
          ) : s.note !== undefined ? (
            <li key={i} className="hn-steps-note">
              {s.text}
            </li>
          ) : (
            <li key={i} className="hn-step">
              <span className={`hn-chip ${s.f === 1 || s.f === 3 ? "hn-chip-ours" : ""}`}>{ACTORS[s.f]}</span>
              <span className="hn-arrow" aria-label="to">
                {"→"}
              </span>
              <span className={`hn-chip ${s.t === 1 || s.t === 3 ? "hn-chip-ours" : ""}`}>{ACTORS[s.t]}</span>
              <span className={`hn-steptext ${s.bad ? "hn-bad" : ""}`}>{s.text}</span>
            </li>
          )
        )}
      </ol>
    </div>
  );
};
