import type { Metadata } from "next";
import { Brand } from "../_components/Brand";
import { TrustTabs } from "../_components/TrustTabs";
import { ISSUES_URL, REPO_URL, STATUS_URL, TRUST_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: "HelloNear Trust Center", template: "%s · HelloNear Trust Center" },
  alternates: { canonical: TRUST_URL },
};

export default function TrustLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="trust">
      <header className="topbar">
        <Brand href="/trust" label="Trust Center" />
        <div className="topbar-links buttons">
          <a className="btn" href={ISSUES_URL}>Report an issue</a>
          <a className="btn" href={STATUS_URL}>Status</a>
          <a className="btn" href="/">Docs</a>
        </div>
      </header>
      <section className="hero">
        <div className="hero-inner">
          <h1>Welcome to the HelloNear Trust Center</h1>
          <p>
            HelloNear lets an AI agent pay for you while the rules about money stay out of its reach. Here is what protects your data and
            funds, and a link to check each claim yourself.
          </p>
          <p className="hero-links">
            <a href="/privacy">Privacy</a> · <a href={`${REPO_URL}#security-model`}>Security model</a> · <a href="/contracts">Receipts</a>
          </p>
        </div>
      </section>
      <TrustTabs />
      <main className="trust-main">{children}</main>
      <footer className="trust-foot muted small">
        Everything here runs on NEAR testnet during NEAR HACKATHON (1 to 14 Nov 2026). <a href="/trust.md">This page as Markdown</a>
      </footer>
    </div>
  );
}
