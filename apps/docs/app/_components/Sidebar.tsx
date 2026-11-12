import Link from "next/link";
import { orderedSections } from "@/lib/content";

// Server-rendered nav. On phones it sits inside a <details> menu, so it works without JavaScript.
export function NavList({ current }: { current: string }) {
  return (
    <nav aria-label="Docs">
      {orderedSections().map((s) => (
        <div key={s.title} className="nav-group">
          <p className="nav-title">{s.title}</p>
          <ul>
            {s.pages.map((p) => (
              <li key={p.slug}>
                <Link href={`/${p.slug}`} aria-current={p.slug === current ? "page" : undefined}>
                  {p.slug === "trust" ? "Trust Center" : p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
