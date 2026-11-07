import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Geist, Geist_Mono } from "next/font/google"
import { cn } from "@/lib/utils"
import { AppProviders } from "@/providers/AppProviders"
import "@/styles/globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
// Mono is only for wallet addresses (design rule).
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: { default: "HelloNear", template: "%s · HelloNear" },
  description: "AI helpers with their own wallet and spending limits you control.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable, geistMono.variable)}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
