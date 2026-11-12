import { getPage, pageMarkdown, pages } from "@/lib/content";

// Every page as Markdown. Reached through proxy.ts: /<path>.md, or any path asked for with Accept: text/markdown.
export const dynamicParams = false;
export const generateStaticParams = () => pages.map((p) => ({ slug: p.slug ? p.slug.split("/") : [] }));

export async function GET(_req: Request, ctx: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await ctx.params;
  const page = getPage((slug ?? []).join("/"));
  if (!page) return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(pageMarkdown(page), { headers: { "content-type": "text/markdown; charset=utf-8", vary: "Accept" } });
}
