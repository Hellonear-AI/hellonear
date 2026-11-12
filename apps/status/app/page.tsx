import { AutoRefresh } from "./AutoRefresh";
import { GROUPS, HEADLINE, LABEL, ago, incidents, loadStatus, pct, type Service, type Status } from "@/lib/status";

// Rendered on the server and revalidated with the data (lib/status.ts), so the page works without JavaScript.
export const revalidate = 30;

export default async function Page() {
  const status = await loadStatus();
  return (
    <main className="wrap">
      <AutoRefresh />
      <header className="top">
        <a className="brand" href="https://hellonear.xyz">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={32} height={32} />
          <span>
            HelloNear <span className="muted">Status</span>
          </span>
        </a>
        <a className="ghost" href="https://app.hellonear.xyz">
          Open the app
        </a>
      </header>
      {status ? <Board status={status} /> : <Unreachable />}
      <footer className="foot">
        <p>
          Checked every 5 minutes from the HelloNear backend. Each bar is 30 minutes, the last 24 hours; uptime counts slow answers as up.
        </p>
        <p>
          During the hackathon everything runs on NEAR testnet.{" "}
          <a href="https://github.com/Hellonear-AI/hellonear">Source and README</a>
        </p>
      </footer>
    </main>
  );
}

function Unreachable() {
  return (
    <section className="banner down">
      <h1>Can't reach the status API</h1>
      <p>This page couldn't read api.hellonear.xyz just now. That alone doesn't mean the app is down; try again in a minute.</p>
    </section>
  );
}

function Board({ status }: { status: Status }) {
  const open = incidents(status);
  return (
    <>
      <section className={`banner ${status.overall}`}>
        <h1>{HEADLINE[status.overall]}</h1>
        <p className="sub">Updated {ago(status.updatedAt)}</p>
        {open.length > 0 && (
          <ul className="incidents">
            {open.map((s) => (
              <li key={s.id}>
                {/* The impact line says what breaks when a service is down; a slow one still works. */}
                <strong>{s.name}</strong> {s.status === "down" ? "is down" : "is answering slowly"}
                {s.detail ? ` (${s.detail})` : ""}.{s.status === "down" ? ` ${s.impact}` : " It still works."}
              </li>
            ))}
          </ul>
        )}
      </section>
      {GROUPS.map((g) => {
        const services = status.services.filter((s) => s.group === g);
        if (services.length === 0) return null;
        return (
          <section key={g} className="group">
            <h2>{g}</h2>
            <div className="card">
              {services.map((s) => (
                <Row key={s.id} s={s} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function Row({ s }: { s: Service }) {
  return (
    <div className="row">
      <div className="rowtop">
        <span className="name">{s.name}</span>
        <span className={`state ${s.status}`}>
          {LABEL[s.status]}
          {s.latencyMs !== null && s.status !== "down" ? <span className="muted"> · {s.latencyMs} ms</span> : null}
        </span>
      </div>
      <div className="bars" role="img" aria-label={`${s.name}: last 24 hours, ${pct(s.uptime24h)}`}>
        {s.history.map((b) => (
          <span key={b.start} className={`bar ${b.status}`} title={`${new Date(b.start).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}: ${b.status === "none" ? "no check" : b.status}`} />
        ))}
      </div>
      <div className="axis">
        <span>24 h ago</span>
        <span className="line" />
        <span>{pct(s.uptime24h)}</span>
        <span className="line" />
        <span>Now</span>
      </div>
      {s.status === "down" ? <p className="impact">{s.impact}</p> : null}
      <p className="meta">
        Checked {ago(s.checkedAt)}
        {s.uptime7d !== null ? ` · 7 days: ${s.uptime7d.toFixed(2)}%` : ""}
      </p>
    </div>
  );
}
