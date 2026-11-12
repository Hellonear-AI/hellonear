import type { Metadata } from "next";
import Link from "next/link";
import { getPage, sections } from "@/lib/content";
import { render, renderMatrix } from "@/lib/markdown";
import { UpdateCard } from "../_components/UpdateCard";

export const metadata: Metadata = { title: { absolute: "HelloNear Trust Center" }, description: getPage("trust")!.description };

export default function TrustOverview() {
  const page = getPage("trust")!;
  const top = sections(page.markdown, 2);
  const scope = top.items.find((s) => s.title === "Scope and controls")!;
  const controls = sections(top.items.find((s) => s.title === "Controls")!.body, 3);
  const subs = sections(getPage("trust/subprocessors")!.markdown, 3).items;
  const updates = sections(getPage("trust/updates")!.markdown, 3).items.slice(0, 3);
  return (
    <>
      <div className="prose intro" dangerouslySetInnerHTML={{ __html: render(top.intro) }} />

      <section className="block">
        <h2 id="scope">Scope and controls</h2>
        <div className="prose matrix" dangerouslySetInnerHTML={{ __html: renderMatrix(scope.body) }} />
      </section>

      <section className="block">
        <h2 id="controls">Controls</h2>
        <div className="prose" dangerouslySetInnerHTML={{ __html: render(controls.intro) }} />
        <div className="cards">
          {controls.items.map((c) => (
            <div key={c.id} className="tcard" id={c.id}>
              <h3>{c.title}</h3>
              <div className="prose" dangerouslySetInnerHTML={{ __html: render(c.body) }} />
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <div className="block-head">
          <h2 id="subprocessors">Subprocessors</h2>
          <Link href="/trust/subprocessors">View all</Link>
        </div>
        <ul className="chips">
          {subs.map((s) => (
            <li key={s.id}>
              <Link href={`/trust/subprocessors#${s.id}`}>{s.title}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="block">
        <div className="block-head">
          <h2 id="updates">Updates</h2>
          <Link href="/trust/updates">View all</Link>
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
