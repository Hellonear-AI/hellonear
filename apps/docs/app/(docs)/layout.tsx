import Link from "next/link";
import { Brand } from "../_components/Brand";
import { REPO_URL, STATUS_URL } from "@/lib/site";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <Brand href="/" label="Docs" />
        <div className="topbar-links">
          <Link href="/trust">Trust</Link>
          <a href={STATUS_URL}>Status</a>
          <a href={REPO_URL}>GitHub</a>
        </div>
      </header>
      {children}
    </>
  );
}
