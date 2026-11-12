import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { OverlayScrollbar } from "@/components/OverlayScrollbar";
import { PageLoader } from "@/components/PageLoader";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

// The link preview (Ancung, 12 Nov): app/opengraph-image.png and twitter-image.png, the hero at
// 1200 x 630, picked up by Next.js; metadataBase makes their URLs absolute.
const DESCRIPTION =
  "An AI helper with its own NEAR wallet. Every payment asks you first, unless you set a rule, and the limits are stored where your Mind can't change them.";

export const metadata: Metadata = {
  metadataBase: new URL("https://hellonear.xyz"),
  title: "HelloNear",
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "HelloNear", url: "/", title: "HelloNear", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "HelloNear", description: DESCRIPTION },
};

// A refresh starts at the hero (Ancung, 12 Nov): no restored scroll and no section hash. Run before
// the page paints, so it never jumps there first.
const TO_TOP = `history.scrollRestoration="manual";if(location.hash)history.replaceState(null,"",location.pathname+location.search);window.scrollTo(0,0);`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TO_TOP }} />
      </head>
      <body>
        <PageLoader />
        <OverlayScrollbar />
        {children}
      </body>
    </html>
  );
}
