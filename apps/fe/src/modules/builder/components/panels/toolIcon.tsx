import { ClockIcon, MailIcon, SearchIcon } from "lucide-react"
import type { ReactNode } from "react"
import { APPS } from "@/modules/connections/data/apps"

/**
 * Each Builder tool's icon in the picker (Ancung, 11 Nov): an app's own logo, the same as in
 * Connections, for tools named after the app (`googlesheets_…`), and a plain icon for the rest.
 */
export function builderToolIcon(tool: string): ReactNode {
  const app = APPS.find((a) => tool.startsWith(`${a.toolkit}_`))
  if (app) return app.logo
  if (tool === "near_view_account") return <SearchIcon />
  if (tool === "get_time") return <ClockIcon />
  if (tool === "mail_send_to_owner") return <MailIcon />
  return null
}
