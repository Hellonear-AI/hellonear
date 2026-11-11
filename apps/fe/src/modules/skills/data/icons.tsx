import { AtSignIcon, BadgePercentIcon, CalendarX2Icon, ChartPieIcon, ClipboardCheckIcon, EyeOffIcon, FileLockIcon, HeartPulseIcon, LandmarkIcon, MailWarningIcon, ReceiptIcon, ReceiptTextIcon, ReplyIcon, ShieldCheckIcon, SnowflakeIcon, SplitIcon, StoreIcon, TagIcon, CalendarDaysIcon, ChartNoAxesColumnIcon, ClipboardListIcon, PlugIcon, RepeatIcon, SearchIcon, SunriseIcon, WalletIcon, type LucideIcon } from "lucide-react"
import type { ComponentType } from "react"
import { GmailLogo, GoogleDocsLogo, GoogleSheetsLogo, NotionLogo, OutlookLogo, SlackLogo, ZoomLogo } from "@/components/elements/AppLogos"

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
  // The skills for the five tracks (#194, #211).
  "best-price": TagIcon,
  "price-watch": BadgePercentIcon,
  "split-bill": SplitIcon,
  "revenue-split": ChartPieIcon,
  invoice: ReceiptTextIcon,
  "mind-seller": StoreIcon,
  "treasury-report": LandmarkIcon,
  "recipient-guard": ShieldCheckIcon,
  "phishing-detector": MailWarningIcon,
  "freeze-advisor": SnowflakeIcon,
  "spending-audit": ClipboardCheckIcon,
  "confidential-reader": FileLockIcon,
  "redact-before-send": EyeOffIcon,
  "health-journal": HeartPulseIcon,
  "follow-ups": ReplyIcon,
  "spending-tracker": ReceiptIcon,
  "calendar-conflicts": CalendarX2Icon,
  // App skills show their app's logo, like Email helper's Gmail.
  docs: GoogleDocsLogo,
  sheets: GoogleSheetsLogo,
  notion: NotionLogo,
  outlook: OutlookLogo,
  slack: SlackLogo,
  zoom: ZoomLogo,
}
