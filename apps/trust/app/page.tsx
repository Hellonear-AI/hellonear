import type { Metadata } from "next";
import Link from "next/link";
import { getPage, sections } from "@/lib/content";
import { parseTable, render, type Cell } from "@/lib/markdown";
import { ControlIcon } from "./_components/ControlIcon";
import { UpdateCard } from "./_components/UpdateCard";

// "Trust | HelloNear", like the web app's "Chat | HelloNear" (Ancung, 13 Nov).
export const metadata: Metadata = { title: { absolute: "Trust | HelloNear" }, description: getPage("")!.description };

export default function TrustOverview() {
  const page = getPage("")!;
  const top = sections(page.markdown, 2);
  const scope = top.items.find((s) => s.title === "Scope and controls")!;
  const controls = sections(top.items.find((s) => s.title === "Controls")!.body, 3);
  const subs = sections(getPage("subprocessors")!.markdown, 3).items;
  const updates = sections(getPage("updates")!.markdown, 3).items.slice(0, 3);
  const table = parseTable(scope.body);
  const note = scope.body
    .split("\n")
    .filter((l) => !l.trim().startsWith("|"))
    .join("\n")
    .trim();
  const [lead, ...after] = note.split("\n\n");
  // The numbers in the strip are counted from the content itself, so they can't drift from it.
  const proofs = table.rows.flat().filter((c) => c.text === "Yes" && c.href).length;
  const stats = [
    { n: table.rows.length, label: "parts in scope" },
    { n: proofs, label: "claims, each with a proof link" },
    { n: controls.items.length, label: "controls in the code" },
    { n: subs.length, label: "subprocessors listed" },
  ];
  return (
    <>
      <ul className="stats" aria-label="At a glance">
        {stats.map((s) => (
          <li key={s.label}>
            <span className="stat-n">{s.n}</span>
            <span className="stat-l">{s.label}</span>
          </li>
        ))}
      </ul>

      <div className="prose intro" dangerouslySetInnerHTML={{ __html: render(top.intro) }} />

      <section className="block">
        <h2 id="scope">Scope and controls</h2>
        <div className="prose lead-note" dangerouslySetInnerHTML={{ __html: render(lead) }} />
        <ScopeTable head={table.head} rows={table.rows} />
        <ScopeCards head={table.head} rows={table.rows} />
        {after.length ? <div className="prose small muted scope-after" dangerouslySetInnerHTML={{ __html: render(after.join("\n\n")) }} /> : null}
      </section>

      <section className="block">
        <h2 id="controls">Controls</h2>
        <div className="prose lead-note" dangerouslySetInnerHTML={{ __html: render(controls.intro) }} />
        <div className="cards">
          {controls.items.map((c) => (
            <div key={c.id} className="tcard ctl" id={c.id}>
              <ControlIcon title={c.title} />
              <h3>{c.title}</h3>
              <div className="prose" dangerouslySetInnerHTML={{ __html: render(c.body) }} />
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <div className="block-head">
          <h2 id="subprocessors">Subprocessors</h2>
          <Link href="/subprocessors">View all</Link>
        </div>
        <ul className="chips">
          {subs.map((s) => (
            <li key={s.id}>
              <Link href={`/subprocessors#${s.id}`}>{s.title}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="block">
        <div className="block-head">
          <h2 id="updates">Updates</h2>
          <Link href="/updates">View all</Link>
        </div>
        <div className="cards">
          {updates.map((u) => (
            <UpdateCard key={u.id} title={u.title} body={u.body} id={u.id} short />
          ))}
        </div>
      </section>
    </>
  );
}

// A "Yes" is a green check that opens its proof; "N/A" stays quiet.
function Mark({ c }: { c: Cell }) {
  if (c.text === "Yes")
    return c.href ? (
      <a className="yes" href={c.href} rel="noopener noreferrer" aria-label="Yes, see the proof">
        <Check /> Yes
      </a>
    ) : (
      <span className="yes">
        <Check /> Yes
      </span>
    );
  if (c.text === "N/A")
    return (
      <span className="na" title="Does not apply to this part">
        N/A
      </span>
    );
  return <span>{c.text}</span>;
}

const Check = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function ScopeTable({ head, rows }: { head: string[]; rows: Cell[][] }) {
  return (
    <div className="scope-table">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0].text}>
              <th scope="row">{r[0].text}</th>
              {r.slice(1).map((c, i) => (
                <td key={i}>
                  <Mark c={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Phones: one card per part, its controls as lines, the ones that apply first.
function ScopeCards({ head, rows }: { head: string[]; rows: Cell[][] }) {
  return (
    <div className="scope-cards">
      {rows.map((r) => {
        const lines = r.slice(1).map((c, i) => ({ c, label: head[i + 1] }));
        lines.sort((a, b) => Number(b.c.text === "Yes") - Number(a.c.text === "Yes"));
        return (
          <div key={r[0].text} className="scope-card">
            <p className="scope-card-title">{r[0].text}</p>
            <ul>
              {lines.map(({ c, label }) => (
                <li key={label} className={c.text === "Yes" ? "" : "is-na"}>
                  <span>{label}</span>
                  <Mark c={c} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
