import { AtSignIcon, CalendarDaysIcon, ChartNoAxesColumnIcon, ClipboardListIcon, PlugIcon, RepeatIcon, SearchIcon, SunriseIcon, WalletIcon, type LucideIcon } from "lucide-react"
import type { ComponentType } from "react"
import { GmailLogo } from "@/components/elements/AppLogos"

/** Each skill's icon on its card and page. */
export const SKILL_ICON: Record<string, LucideIcon | ComponentType<{ className?: string }>> = {
  payments: WalletIcon,
  // The Gmail logo from the design, not a generic envelope (Ancung, 9 Nov).
  "email-triage": GmailLogo,
  "daily-planner": CalendarDaysIcon,
  "near-account": SearchIcon,
  "http-request": PlugIcon,
  "email-address": AtSignIcon,
  "morning-briefing": SunriseIcon,
  subscriptions: RepeatIcon,
  "meeting-prep": ClipboardListIcon,
  "paid-data": ChartNoAxesColumnIcon,
}
