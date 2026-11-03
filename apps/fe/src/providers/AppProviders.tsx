"use client"

import dynamic from "next/dynamic"
import type { ReactNode } from "react"
import { AppShell } from "@/components/layout/AppShell"
import { NETWORK_ID } from "@/lib/config"

// Wallet libraries need browser APIs, so the provider loads after hydration.
const NearProvider = dynamic(() => import("near-connect-hooks").then((m) => m.NearProvider), {
  ssr: false,
})

// Kept outside the component so the provider gets a stable config object.
const nearConfig = { network: NETWORK_ID }

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <NearProvider config={nearConfig}>
      <AppShell>{children}</AppShell>
    </NearProvider>
  )
}
