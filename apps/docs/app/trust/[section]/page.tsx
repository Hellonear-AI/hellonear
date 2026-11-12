import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPage, sections } from "@/lib/content";
import { render } from "@/lib/markdown";
import { FaqControls } from "../../_components/Faq";
import { UpdateCard } from "../../_components/UpdateCard";

const SECTIONS = ["resources", "subprocessors", "faq", "updates"] as const;
type Props = { params: Promise<{ section: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => SECTIONS.map((section) => ({ section }));

async function pageOf(props: Props) {
  const { section } = await props.params;
  const page = getPage(`trust/${section}`);
  if (!page) notFound();
  return { section, page };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { section, page } = await pageOf(props);
  return { title: page.title, description: page.description, alternates: { canonical: `/trust/${section}`, types: { "text/markdown": `/trust/${section}.md` } } };
}

export default async function TrustSection(props: Props) {
  const { section, page } = await pageOf(props);
  return (
    <>
      <h2 className="section-title">{page.title}</h2>
      <p className="lede">{page.description}</p>
      {section === "faq" && <Faq markdown={page.markdown} />}
      {section === "subprocessors" && <Cards markdown={page.markdown} className="sub" />}
      {section === "resources" && <Resources markdown={page.markdown} />}
      {section === "updates" && (
        <div className="cards one">
          {sections(page.markdown, 3).items.map((u) => (
            <UpdateCard key={u.id} title={u.title} body={u.body} id={u.id} />
          ))}
        </div>
      )}
    </>
  );
}

function Cards({ markdown, className }: { markdown: string; className: string }) {
  const s = sections(markdown, 3);
  return (
    <>
      {s.intro && <div className="prose" dangerouslySetInnerHTML={{ __html: render(s.intro) }} />}
      <div className="cards">
        {s.items.map((c) => (
          <div key={c.id} id={c.id} className={`tcard ${className}`}>
            <h3>{c.title}</h3>
            <div className="prose" dangerouslySetInnerHTML={{ __html: render(c.body) }} />
          </div>
        ))}
      </div>
    </>
  );
}

function Resources({ markdown }: { markdown: string }) {
  return (
    <div className="cards">
      {sections(markdown, 2).items.map((g) => (
        <section key={g.id} id={g.id} className="tcard">
          <h3>{g.title}</h3>
          <div className="prose" dangerouslySetInnerHTML={{ __html: render(g.body) }} />
        </section>
      ))}
    </div>
  );
}

function Faq({ markdown }: { markdown: string }) {
  return (
    <FaqControls>
      {sections(markdown, 2).items.map((cat) => (
        <section key={cat.id} className="faq-cat">
          <h3 id={cat.id}>{cat.title}</h3>
          {sections(cat.body, 3).items.map((q) => (
            <details key={q.id} id={q.id} className="faq-q">
              <summary>
                {q.title}
                <a className="anchor" href={`#${q.id}`} aria-label="Link to this question">#</a>
              </summary>
              <div className="prose" dangerouslySetInnerHTML={{ __html: render(q.body) }} />
            </details>
          ))}
        </section>
      ))}
    </FaqControls>
  );
}
