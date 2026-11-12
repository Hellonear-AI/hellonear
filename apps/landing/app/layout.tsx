import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { PageLoader } from "@/components/PageLoader";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "HelloNear: a Mind that can't spend more than you allow",
  description:
    "An AI helper with its own NEAR wallet. Every payment asks you first, unless you set a rule, and the limits are stored where your Mind can't change them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        <PageLoader />
        {children}
      </body>
    </html>
  );
}
