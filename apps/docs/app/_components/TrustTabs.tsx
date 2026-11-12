"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TRUST_TABS } from "@/lib/nav";

export function TrustTabs() {
  const path = usePathname().replace(/\/$/, "");
  return (
    <nav className="tabs" aria-label="Trust Center">
      <div className="tabs-inner">
        {TRUST_TABS.map((t) => (
          <Link key={t.slug} href={`/${t.slug}`} aria-current={path === `/${t.slug}` || (t.slug === "trust" && path === "") ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
