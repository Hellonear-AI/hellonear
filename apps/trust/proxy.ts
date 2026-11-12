import { NextResponse, type NextRequest } from "next/server";

/** Whether the client prefers Markdown over HTML (Accept lists text/markdown, and before text/html if both). */
export function wantsMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const a = accept.toLowerCase();
  const md = a.indexOf("text/markdown");
  if (md < 0) return false;
  const html = a.indexOf("text/html");
  return html < 0 || md < html;
}

/** Where a request should be served from, or null to serve it as is: /faq.md and Markdown-preferring requests read /md/faq. */
export function rewriteTarget(path: string, accept: string | null): string | null {
  const p = path.replace(/\/+$/, "") || "/";
  if (p.endsWith(".md")) {
    const slug = p.slice(0, -3).replace(/^\/(index)?$/, "/");
    return `/md${slug === "/" ? "" : slug}`;
  }
  if (wantsMarkdown(accept) && !p.includes(".") && !p.startsWith("/md")) return `/md${p === "/" ? "" : p}`;
  return null;
}

export function proxy(request: NextRequest) {
  const target = rewriteTarget(request.nextUrl.pathname, request.headers.get("accept"));
  if (!target) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/|api/|icon.svg|favicon.ico|apple-icon.png|llms).*)"],
};
