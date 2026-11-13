import { AutoRefresh } from "./AutoRefresh";
import { BarSheet } from "./BarSheet";
import { GROUP_LABEL, GROUPS, HEADLINE, LABEL, ago, bucketLines, duration, incidentDays, incidents, loadStatus, pct, type Service, type Status } from "@/lib/status";

// Rendered on the server and revalidated with the data (lib/status.ts), so the page works without JavaScript.
export const revalidate = 30;

export default async function Page() {
  const status = await loadStatus();
  return (
    <main className="wrap">
      <AutoRefresh />
      <BarSheet />
      <header className="top">
        <a className="brand" href="https://hellonear.xyz">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={32} height={32} />
          <span>
            HelloNear <span className="muted">Status</span>
          </span>
        </a>
      </header>
      {status ? <Board status={status} /> : <Unreachable />}
      <footer className="foot">
        <p>
          Checked every 5 minutes from the HelloNear backend. Each bar is 30 minutes, the last 24 hours (hover one for details); uptime counts slow answers as up. Times are UTC.
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
        <p className="sub">
          <span className="live">Live</span>
          Updated {ago(status.updatedAt)}, checked every 5 minutes
        </p>
        {open.length > 0 && (
          <ul className="incidents">
            {open.map((s) => (
              <li key={s.id}>
                {/* The impact line says what breaks when a service is down; a slow one still works. */}
                <strong>{s.name}</strong> {s.status === "down" ? "is down" : "is answering slowly"}
                {s.detail ? ` (${trimDot(s.detail)})` : ""}.{s.status === "down" ? ` ${s.impact}` : " It still works."}
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
            <h2>{GROUP_LABEL[g]}</h2>
            <div className="card">
              {services.map((s) => (
                <Row key={s.id} s={s} />
              ))}
            </div>
          </section>
        );
      })}
      {status.incidents ? <PastIncidents status={status} /> : null}
    </>
  );
}

// The backend writes details as sentences; the page adds its own full stop.
const trimDot = (s: string) => s.replace(/[.\s]+$/, "");

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function PastIncidents({ status }: { status: Status }) {
  return (
    <section className="past">
      <h2 className="pasttitle">Past incidents</h2>
      <p className="pastnote">Worked out from the checks: failed checks in a row of one service make one incident. Times in UTC.</p>
      {incidentDays(status.incidents ?? []).map(({ day, items }) => (
        <div key={day} className="day">
          <h3>{new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</h3>
          {items.length === 0 ? (
            <p className="quiet">No incidents reported.</p>
          ) : (
            items.map((x) => (
              <div key={`${x.service}-${x.start}`} className="incident">
                <p className={`ititle ${x.status}`}>
                  {x.name} {x.status === "down" ? "down" : "slow"}
                </p>
                <p>
                  <strong>{x.end ? "Resolved" : "Ongoing"}</strong>
                  {" - "}
                  {x.end ? `From ${clock(x.start)} to ${clock(x.end)}` : `Since ${clock(x.start)}`} ({duration(x.minutes)}).
                  {x.detail ? ` ${trimDot(x.detail)}.` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      ))}
    </section>
  );
}

function Row({ s }: { s: Service }) {
  return (
    <div className="row">
      <div className="rowtop">
        <span className="name">{s.name}</span>
        {/* The latency in grey, then the state in its colour (no "·" separators, no dots). */}
        <span className="stateline">
          {s.latencyMs !== null && s.status !== "down" ? <span className="latency">{s.latencyMs} ms</span> : null}
          <span className={`state ${s.status}`}>
            {LABEL[s.status]}
          </span>
        </span>
      </div>
      <div className="bars" data-service={s.name} role="img" aria-label={`${s.name}: last 24 hours, ${pct(s.uptime24h)}`}>
        {s.history.map((b, i) => {
          const l = bucketLines(b, "en-GB");
          // Tooltips near the edges open inward, so they never run off the card.
          const side = i < 8 ? "left" : i > s.history.length - 9 ? "right" : "mid";
          return (
            <span key={b.start} className={`bar ${l.level}`}>
              <span className={`tip ${side}`} role="tooltip">
                <span className="tipwhen">{l.when}</span>
                {l.level === "ok" ? (
                  <span className="tipok">No downtime recorded in this half hour.</span>
                ) : (
                  <span className={`tipstate ${l.level}`}>
                    {l.state}
                    {l.minutes ? <span className="tipmin">about {l.minutes} min</span> : null}
                  </span>
                )}
                {l.detail ? <span className="tipdetail">{l.detail}</span> : null}
                {b.checks ? <span className="tipmeta">{b.checks} {b.checks === 1 ? "check" : "checks"}{b.bad ? `, ${b.bad} with a problem` : ", all fine"}</span> : null}
              </span>
            </span>
          );
        })}
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
        {s.uptime7d !== null ? `, ${s.uptime7d.toFixed(2)}% over 7 days` : ""}
      </p>
    </div>
  );
}
