import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPage, markdownUrl, orderedSections, pages } from "@/lib/content";
import { render } from "@/lib/markdown";
import { REPO_URL } from "@/lib/site";
import { NavList } from "../../_components/Sidebar";
import { Swagger } from "../../_components/Swagger";

type Props = { params: Promise<{ slug?: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return pages.filter((p) => !p.slug.startsWith("trust")).map((p) => ({ slug: p.slug ? p.slug.split("/") : [] }));
}

async function pageOf(props: Props) {
  const { slug } = await props.params;
  const page = getPage((slug ?? []).join("/"));
  if (!page || page.slug.startsWith("trust")) notFound();
  return page;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const page = await pageOf(props);
  return {
    title: page.slug ? page.title : { absolute: "HelloNear Docs" },
    description: page.description,
    alternates: { canonical: `/${page.slug}`, types: { "text/markdown": markdownUrl(page.slug) } },
  };
}

export default async function DocPage(props: Props) {
  const page = await pageOf(props);
  const flat = orderedSections().flatMap((s) => s.pages).filter((p) => !p.slug.startsWith("trust"));
  const i = flat.findIndex((p) => p.slug === page.slug);
  const prev = flat[i - 1];
  const next = flat[i + 1];
  return (
    <div className="docs">
      <aside className="sidebar">
        <NavList current={page.slug} />
      </aside>
      <details className="mobile-nav">
        <summary>Menu</summary>
        <NavList current={page.slug} />
      </details>
      <main className="doc">
        <article>
          <p className="eyebrow">{orderedSections().find((s) => s.pages.some((p) => p.slug === page.slug))?.title}</p>
          <h1>{page.title}</h1>
          <p className="lede">{page.description}</p>
          <div className="prose" dangerouslySetInnerHTML={{ __html: render(page.markdown) }} />
          {page.slug === "api-reference" && <Swagger url="/openapi.json" />}
        </article>
        <footer className="doc-foot">
          <div className="pager">
            {prev ? <Link href={`/${prev.slug}`}>← {prev.title}</Link> : <span />}
            {next ? <Link href={`/${next.slug}`}>{next.title} →</Link> : <span />}
          </div>
          <p className="muted small">
            <a href={markdownUrl(page.slug)}>View as Markdown</a> · <a href={`${REPO_URL}/blob/main/apps/docs/content/${page.slug || "index"}.md`}>Edit on GitHub</a>
          </p>
        </footer>
      </main>
    </div>
  );
}
