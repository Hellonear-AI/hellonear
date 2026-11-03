import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Geist } from "next/font/google"
import { cn } from "@/lib/utils"
import { AppProviders } from "@/providers/AppProviders"
import "@/styles/globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: { default: "HelloNear", template: "%s · HelloNear" },
  description: "AI helpers with their own wallet and spending limits you control.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
