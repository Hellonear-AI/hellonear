import { NextResponse, type NextRequest } from "next/server";

const TRUST_SECTIONS = new Set(["", "resources", "subprocessors", "faq", "updates"]);

/** Whether the client prefers Markdown over HTML (Accept lists text/markdown, and before text/html if both). */
export function wantsMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const a = accept.toLowerCase();
  const md = a.indexOf("text/markdown");
  if (md < 0) return false;
  const html = a.indexOf("text/html");
  return html < 0 || md < html;
}

/** Where a request should be served from, or null to serve it as is. */
export function rewriteTarget(host: string, path: string, accept: string | null): string | null {
  let p = path.replace(/\/+$/, "") || "/";
  // trust.hellonear.xyz/faq is /trust/faq.
  if (host.startsWith("trust.")) {
    const rest = p.replace(/^\//, "").replace(/\.md$/, "");
    if (TRUST_SECTIONS.has(rest)) p = (rest ? `/trust/${rest}` : "/trust") + (path.endsWith(".md") ? ".md" : "");
  }
  if (p.endsWith(".md") && p !== "/skill.md") {
    const slug = p.slice(0, -3).replace(/^\/(index)?$/, "/");
    return `/md${slug === "/" ? "" : slug}`;
  }
  if (wantsMarkdown(accept) && !p.includes(".") && !p.startsWith("/md") && p !== "/mcp") return `/md${p === "/" ? "" : p}`;
  return p !== (path.replace(/\/+$/, "") || "/") ? p : null;
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const target = rewriteTarget(host, request.nextUrl.pathname, request.headers.get("accept"));
  if (!target) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/|api/|icon.svg|favicon.ico|apple-icon.png|openapi.json|llms|\\.well-known/).*)"],
};
