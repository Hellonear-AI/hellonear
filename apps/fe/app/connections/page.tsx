import { ConnectReturn } from "@/modules/connections/components/ConnectReturn"

export const metadata = { title: "Connections" }

// Where Composio sends the Google sign-in window back to (`{FE_ORIGIN}/connections?toolkit=…`,
// docs/api-contract.md §7). The query string proves nothing; the page that opened this window
// reads GET /connections itself.
export default function Page() {
  return <ConnectReturn />
}
