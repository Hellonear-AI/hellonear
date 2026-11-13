import Link from "next/link";
import { render } from "@/lib/markdown";

// Markdown to one plain line for the short card's excerpt: links keep their words, code its text.
const plain = (md: string) =>
  md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/**
 * An update. On the Overview (short) it is a card of even height: the category and date, the title, the
 * first lines of the update and a link to read it (Ancung, 13 Nov: a title alone left the cards uneven and
 * the lime category pill read casual). On /updates it shows the whole text.
 */
export function UpdateCard({ title, body, id, short }: { title: string; body: string; id: string; short?: boolean }) {
  const [meta, ...rest] = body.split("\n");
  const [date, category] = meta.replace(/^Published /, "").split(" · ");
  const text = rest.join("\n").trim();
  const day = new Date(date);
  const valid = !Number.isNaN(day.getTime());
  const when = valid ? day.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : date;
  return (
    <article className={`tcard update ${short ? "update-short" : ""}`} id={id}>
      <p className="update-meta">
        <span className="tag">{category}</span>
        <time dateTime={valid ? day.toISOString().slice(0, 10) : undefined}>{short ? when : `Published ${date}`}</time>
      </p>
      <h3>{short ? <Link href={`/updates#${id}`}>{title}</Link> : title}</h3>
      {short ? (
        <>
          <p className="update-excerpt">{plain(text)}</p>
          <Link className="update-more" href={`/updates#${id}`}>
            Read update
          </Link>
        </>
      ) : (
        <div className="prose" dangerouslySetInnerHTML={{ __html: render(text) }} />
      )}
    </article>
  );
}
