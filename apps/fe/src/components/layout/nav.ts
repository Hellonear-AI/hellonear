import {
  MessageCircleIcon,
  PlugIcon,
  PuzzleIcon,
  RepeatIcon,
  SwordsIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

// The places in the app, in the design's order (sidebar, rail and phone drawer).
// No Builder item: Builder opens from Autopilot only (decided 6 Nov).
export type NavItem = {
  segment: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { segment: "chat", label: "Chat", icon: MessageCircleIcon },
  { segment: "wallet", label: "Wallet", icon: WalletIcon },
  { segment: "skills", label: "Skills", icon: PuzzleIcon },
  { segment: "autopilot", label: "Autopilot", icon: RepeatIcon },
  { segment: "connections", label: "Connections", icon: PlugIcon },
  { segment: "attack", label: "Attack playground", icon: SwordsIcon },
]

export function mindHref(mindId: string, segment = "chat") {
  return `/minds/${mindId}/${segment}`
}
