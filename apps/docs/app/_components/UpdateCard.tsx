import Link from "next/link";
import { render } from "@/lib/markdown";

export function UpdateCard({ title, body, id, short }: { title: string; body: string; id: string; short?: boolean }) {
  const [meta, ...rest] = body.split("\n");
  const [date, category] = meta.replace(/^Published /, "").split(" · ");
  const text = rest.join("\n").trim();
  return (
    <article className="tcard update" id={id}>
      <p className="update-meta">
        <span className="tag">{category}</span> <span className="muted">Published {date}</span>
      </p>
      <h3>{short ? <Link href={`/trust/updates#${id}`}>{title}</Link> : title}</h3>
      {!short && <div className="prose" dangerouslySetInnerHTML={{ __html: render(text) }} />}
    </article>
  );
}
