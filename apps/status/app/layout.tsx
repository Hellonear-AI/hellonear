import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

const DESCRIPTION = "Live status of HelloNear and the services it runs on: NEAR AI Cloud, NEAR Intents, OutLayer, NEAR RPC and more.";

export const metadata: Metadata = {
  metadataBase: new URL("https://status.hellonear.xyz"),
  title: "HelloNear Status",
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "HelloNear", url: "/", title: "HelloNear Status", description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
