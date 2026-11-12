import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Brand } from "./_components/Brand";
import { TrustTabs } from "./_components/TrustTabs";
import { DOCS_URL, ISSUES_URL, REPO_URL, SITE_URL, STATUS_URL } from "@/lib/site";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "HelloNear Trust Center", template: "%s · HelloNear Trust Center" },
  description: "What protects your data and funds on HelloNear, with a link to check each claim yourself.",
  openGraph: { type: "website", siteName: "HelloNear Trust Center" },
  alternates: { types: { "text/plain": "/llms.txt" } },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <div className="trust">
          <header className="topbar">
            <Brand href="/" label="Trust Center" />
            <div className="topbar-links buttons">
              <a className="btn" href={ISSUES_URL}>Report an issue</a>
              <a className="btn" href={STATUS_URL}>Status</a>
              <a className="btn" href={DOCS_URL}>Docs</a>
            </div>
          </header>
          <section className="hero">
            <div className="hero-inner">
              <h1>Welcome to the HelloNear Trust Center</h1>
              <p>
                HelloNear lets an AI agent pay for you while the rules about money stay out of its reach. Here is what protects your data
                and funds, and a link to check each claim yourself.
              </p>
              <p className="hero-links">
                <a href={`${DOCS_URL}/privacy`}>Privacy</a> · <a href={`${REPO_URL}#security-model`}>Security model</a> ·{" "}
                <a href={`${DOCS_URL}/contracts`}>Receipts</a>
              </p>
            </div>
          </section>
          <TrustTabs />
          <main className="trust-main">{children}</main>
          <footer className="trust-foot muted small">
            Everything here runs on NEAR testnet during NEAR HACKATHON (1 to 14 Nov 2026). Every page is also Markdown: add{" "}
            <code>.md</code> to its path, or read <a href="/llms.txt">llms.txt</a>.
          </footer>
        </div>
      </body>
    </html>
  );
}
