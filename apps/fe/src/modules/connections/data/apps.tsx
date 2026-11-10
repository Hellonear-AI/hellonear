import type { ReactNode } from "react"
import {
  GmailLogo,
  GoogleCalendarLogo,
  GoogleDocsLogo,
  GoogleDriveLogo,
  GoogleMeetLogo,
  GoogleSheetsLogo,
  NotionLogo,
  OutlookLogo,
  SlackLogo,
} from "@/components/elements/AppLogos"
import type { Toolkit } from "@/modules/connections/api"

/**
 * The apps an owner can connect (account level, through Composio), with the words each place
 * uses: what uses it, what stops when it disconnects, and whose sign-in page opens. One list for
 * Connections, its Disconnect dialog and the Skills dialogs. Discord and HubSpot can be connected
 * on the backend, but no skill uses them yet (#194), so they aren't offered.
 */
export type AppInfo = {
  toolkit: Toolkit
  logo: ReactNode
  /** Whose sign-in page opens: "Waiting for Google". */
  by: string
  uses: string
  needs: string
  /** "… is disconnected, so {paused} is paused." */
  paused: string
  /** "… ended the connection. {lost} until you reconnect." */
  lost: string
  /** The Disconnect dialog's list for a Mind's name: what stops (false) and what stays (true). */
  disconnect: (mind: string) => { ok: boolean; t: string }[]
}

export const APPS: AppInfo[] = [
  {
    toolkit: "gmail",
    logo: <GmailLogo />,
    by: "Google",
    uses: "Used by Email helper to read mail and save drafts.",
    needs: "Email helper needs it to read your mail and save drafts.",
    paused: "Email helper",
    lost: "Email helper can't read mail",
    disconnect: (mind) => [
      { ok: false, t: "Email helper can't read or sort your mail" },
      { ok: false, t: `${mind} can't save new drafts` },
      { ok: true, t: "Drafts already in Gmail stay there" },
    ],
  },
  {
    toolkit: "googlecalendar",
    logo: <GoogleCalendarLogo />,
    by: "Google",
    uses: "Used by Daily planner to read your events and add new ones.",
    needs: "Daily planner uses it to read your events and add new ones.",
    paused: "Daily planner's calendar",
    lost: "Daily planner can't see your calendar",
    disconnect: (mind) => [
      { ok: false, t: "Daily planner can't read or add events" },
      { ok: true, t: "Events already in your calendar stay there" },
    ],
  },
  {
    toolkit: "googlemeet",
    logo: <GoogleMeetLogo />,
    by: "Google",
    uses: "Used by Daily planner to add a video link to meetings it schedules.",
    needs: "Daily planner uses it to add a video link to meetings.",
    paused: "Daily planner's meeting links",
    lost: "Daily planner can't add video links to meetings",
    disconnect: (mind) => [
      { ok: false, t: "Daily planner can't add video links to new meetings" },
      { ok: true, t: "Meetings already scheduled keep their links" },
    ],
  },
  // The apps for the five tracks (#195 to #200, Axel's #211).
  {
    toolkit: "googlesheets",
    logo: <GoogleSheetsLogo />,
    by: "Google",
    uses: "Used by Google Sheets to read your spreadsheets and add rows you approve.",
    needs: "The Google Sheets skill needs it to read your spreadsheets.",
    paused: "Google Sheets",
    lost: "Your Mind can't read your spreadsheets",
    disconnect: (mind) => [
      { ok: false, t: `${mind} can't read your spreadsheets or add rows` },
      { ok: true, t: "Rows it already added stay" },
    ],
  },
  {
    toolkit: "googledrive",
    logo: <GoogleDriveLogo />,
    by: "Google",
    uses: "Used by Google Docs to find your files.",
    needs: "The Google Docs skill uses it to find your files.",
    paused: "Finding files in Drive",
    lost: "Your Mind can't find your files",
    disconnect: (mind) => [
      { ok: false, t: `${mind} can't find files in your Drive` },
      { ok: true, t: "Your files stay where they are" },
    ],
  },
  {
    toolkit: "googledocs",
    logo: <GoogleDocsLogo />,
    by: "Google",
    uses: "Used by Google Docs to read your documents and write new ones you approve.",
    needs: "The Google Docs skill needs it to read and write documents.",
    paused: "Google Docs",
    lost: "Your Mind can't read your documents",
    disconnect: (mind) => [
      { ok: false, t: `${mind} can't read your Docs or write new ones` },
      { ok: true, t: "Docs it already wrote stay in your Drive" },
    ],
  },
  {
    toolkit: "notion",
    logo: <NotionLogo />,
    by: "Notion",
    uses: "Used by Notion to read the pages you shared and add pages or rows you approve.",
    needs: "The Notion skill needs it to read your pages.",
    paused: "Notion",
    lost: "Your Mind can't read your Notion",
    disconnect: (mind) => [
      { ok: false, t: `${mind} can't read your Notion or add to it` },
      { ok: true, t: "Pages and rows it already added stay" },
    ],
  },
  {
    toolkit: "outlook",
    logo: <OutlookLogo />,
    by: "Microsoft",
    uses: "Used by Outlook email to read your inbox and save drafts.",
    needs: "The Outlook email skill needs it to read your inbox.",
    paused: "Outlook email",
    lost: "Your Mind can't read your Outlook",
    disconnect: (mind) => [
      { ok: false, t: `${mind} can't read your Outlook or save drafts` },
      { ok: true, t: "Drafts already in Outlook stay there" },
    ],
  },
  {
    toolkit: "slack",
    logo: <SlackLogo />,
    by: "Slack",
    uses: "Used by Slack to post messages you approve. It can't read messages.",
    needs: "The Slack skill needs it to post to your channels.",
    paused: "Posting to Slack",
    lost: "Your Mind can't post to Slack",
    disconnect: (mind) => [
      { ok: false, t: `${mind} can't post to Slack` },
      { ok: true, t: "Messages already posted stay" },
    ],
  },
]

export const appInfo = (toolkit: Toolkit): AppInfo | undefined => APPS.find((a) => a.toolkit === toolkit)
