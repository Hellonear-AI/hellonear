"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import { ThemeProvider } from "next-themes"
import { useState, type ReactNode } from "react"
import { AppShell } from "@/components/layout/AppShell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NETWORK_ID } from "@/lib/config"

// Wallet libraries need browser APIs, so the provider loads after hydration.
const NearProvider = dynamic(() => import("near-connect-hooks").then((m) => m.NearProvider), {
  ssr: false,
})

// Kept outside the component so the provider gets a stable config object.
const nearConfig = { network: NETWORK_ID }

export function AppProviders({ children }: { children: ReactNode }) {
  // One client per browser tab; useState keeps it stable across renders.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })
  )

  return (
    // Theme: System by default, Light or Dark from the account menu (design N1.8).
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <NearProvider config={nearConfig}>
          <TooltipProvider>
            <AppShell>{children}</AppShell>
            <Toaster />
          </TooltipProvider>
        </NearProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
