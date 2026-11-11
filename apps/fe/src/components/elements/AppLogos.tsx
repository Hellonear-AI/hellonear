import { useId } from "react"
import { cn } from "cn"

// Google's 2026 Gmail, Google Calendar and Google Meet icons, shown where an app is connected or
// needed so people recognise it at a glance (Ancung, 9 Nov; the design had a one-colour Gmail).
// Paths and gradients copied as is from thesvg.org (`/icons/gmail-2026/default.svg`,
// `/icons/google-calendar-2026/default.svg`, `/icons/google-meet-2026/default.svg`, read 9 Nov;
// Sheets, Drive, Docs, Slack, Discord, Notion, Outlook and HubSpot (`google-sheets`, `google-drive`,
// `google-docs`, `slack`, `discord`, `notion`, `microsoft-outlook`, `hubspot`) and Telegram
// (`/icons/telegram/default.svg`), read 11 Nov:
// paths, gradients, masks and blurs, nothing else). Each logo is its owner's trademark, used here
// to name the app.
// Ids get a per-use prefix so two logos on one page don't share gradients. Don't redraw or recolour.

/** useId with only safe characters: React's ids have ":" or "«»", which break url(#…) references. */
function useSvgId() {
  return `l${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
}

export function GmailLogo({ className }: { className?: string }) {
  const id = useSvgId()
  return (
    <svg viewBox="0 0 192 192" fill="none" role="img" aria-label="Gmail" className={cn("size-5", className)}>
      <path fill={`url(#${id}a)`} d="M146 44h38v110c0 6.627-5.373 12-12 12h-20a6 6 0 0 1-6-6z" />
      <path fill="#fc413d" d="M46 44H8v110c0 6.627 5.373 12 12 12h20a6 6 0 0 0 6-6z" />
      <path
        fill={`url(#${id}b)`}
        d="M39.226 30.456c-8.033-6.752-20.018-5.714-26.77 2.319-6.752 8.032-5.714 20.017 2.319 26.77l76.078 63.949a8 8 0 0 0 10.295 0l76.078-63.95c8.032-6.752 9.07-18.737 2.318-26.77-6.752-8.032-18.737-9.07-26.769-2.318L96 78.18z"
      />
      <defs>
        <linearGradient id={`${id}a`} x1="165" x2="165" y1="44" y2="166" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60d673" />
          <stop offset=".17" stopColor="#42c868" />
          <stop offset=".39" stopColor="#0ebc5f" />
          <stop offset=".62" stopColor="#00a9bb" />
          <stop offset=".86" stopColor="#3c90ff" />
          <stop offset="1" stopColor="#3186ff" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="8" x2="184" y1="46.13" y2="46.13" gradientUnits="userSpaceOnUse">
          <stop offset=".08" stopColor="#ff63a0" />
          <stop offset=".3" stopColor="#fc413d" />
          <stop offset=".5" stopColor="#fc413d" />
          <stop offset=".65" stopColor="#fc413d" />
          <stop offset=".72" stopColor="#fc5c30" />
          <stop offset=".86" stopColor="#feb10c" />
          <stop offset=".91" stopColor="#fec700" />
          <stop offset=".96" stopColor="#ffdb0f" />
        </linearGradient>
      </defs>
    </svg>
  )
}

const CAL_BODY =
  "M19.867 49.392C17.818 33.82 29.94 20 45.645 20h100.71c15.706 0 27.827 13.82 25.778 29.392L166 96l6.133 46.608C174.182 158.18 162.061 172 146.355 172H45.645c-15.706 0-27.827-13.82-25.778-29.392L26 96z"

export function GoogleCalendarLogo({ className }: { className?: string }) {
  const id = useSvgId()
  return (
    <svg viewBox="0 0 192 192" fill="none" role="img" aria-label="Google Calendar" className={cn("size-5", className)}>
      <path fill="#bbe2ff" d="M32 36.8C32 20.894 44.894 8 60.8 8h70.4C147.106 8 160 20.894 160 36.8v30.4c0 15.906-12.894 28.8-28.8 28.8H60.8C44.894 96 32 83.106 32 67.2z" />
      <path fill="#3c90ff" d={CAL_BODY} />
      <mask id={`${id}a`} width="154" height="152" x="19" y="20" maskUnits="userSpaceOnUse" style={{ maskType: "alpha" }}>
        <path fill="#3c90ff" d={CAL_BODY} />
      </mask>
      <g mask={`url(#${id}a)`}>
        <path fill={`url(#${id}b)`} d="M0 0h166v76H0z" transform="matrix(1 0 0 -1 13 172)" />
      </g>
      <mask id={`${id}c`} width="154" height="152" x="19" y="20" maskUnits="userSpaceOnUse" style={{ maskType: "alpha" }}>
        <path fill="#3186ff" d={CAL_BODY} />
      </mask>
      <g mask={`url(#${id}c)`}>
        <path fill={`url(#${id}d)`} d="M32 27.2C32 16.596 40.596 8 51.2 8h89.6c10.604 0 19.2 8.596 19.2 19.2V96H32z" filter={`url(#${id}e)`} />
      </g>
      <path
        fill="#fff"
        d="M75.353 133.336q-6.282 0-10.777-2.043t-7.61-5.465q-3.065-3.474-4.342-6.793T51.603 115a2.07 2.07 0 0 1 1.021-1.124l5.67-2.247q.714-.357 1.43-.102.714.204 1.685 2.349 1.022 2.145 2.86 4.546a14.3 14.3 0 0 0 4.495 3.728q2.606 1.328 6.435 1.328 6.18 0 9.807-3.575 3.677-3.575 3.677-9.091 0-5.976-3.882-9.194-3.881-3.269-10.266-3.269h-5.362a1.9 1.9 0 0 1-1.328-.51q-.51-.562-.511-1.277v-5.465q0-.767.51-1.277a1.82 1.82 0 0 1 1.329-.562h4.647q5.721 0 9.194-3.116t3.473-8.07q0-4.902-3.116-7.916t-8.58-3.014q-3.065 0-5.312 1.022a11.5 11.5 0 0 0-3.882 2.86 22.7 22.7 0 0 0-2.809 3.78q-1.174 1.941-1.89 2.145-.714.153-1.379-.255l-5.363-2.605q-.664-.358-.868-1.124t1.226-3.575q1.481-2.86 4.494-5.823a21 21 0 0 1 7.049-4.597q4.035-1.635 9.398-1.634 9.96 0 15.782 5.26 5.823 5.21 5.823 13.791 0 5.925-2.86 10.266-2.81 4.34-7.968 6.13v.204q6.231 1.838 9.806 6.741 3.627 4.853 3.626 11.594 0 9.654-6.742 15.834-6.74 6.18-17.57 6.18zm51.25-1.175q-.868 0-1.533-.664a2.25 2.25 0 0 1-.612-1.583V73.118l-11.492 8.274q-.614.46-1.431.307a1.96 1.96 0 0 1-1.225-.766l-3.32-4.7a1.98 1.98 0 0 1-.358-1.43q.153-.816.817-1.276l20.379-14.557q.256-.204.562-.306.307-.153.715-.153h4.291q.868 0 1.379.613.562.56.562 1.43v69.36q0 .92-.664 1.583a2 2 0 0 1-1.533.664z"
      />
      <defs>
        <linearGradient id={`${id}b`} x1="83" x2="83" y1="76" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4fa0ff" />
          <stop offset="1" stopColor="#3186ff" />
        </linearGradient>
        <linearGradient id={`${id}d`} x1="89.06" x2="89.06" y1="21.75" y2="96.39" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a9a8ff" />
          <stop offset=".8" stopColor="#3c90ff" />
        </linearGradient>
        <filter id={`${id}e`} width="152" height="112" x="20" y="-4" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur result="blur" stdDeviation="6" />
        </filter>
      </defs>
    </svg>
  )
}

/**
 * Meteor Wallet's logo, the icon NEAR Connect's official manifest lists for `meteor-wallet`
 * (Meteor-Wallet/meteor_wallet_sdk `assets/meteor-logo-svg.svg`, read 9 Nov: paths, rects, a
 * circle and gradients; its one href points at its own gradient). Copied as is.
 */
export function GoogleMeetLogo({ className }: { className?: string }) {
  const id = useSvgId()
  const body = "M8 71c0-24.3 19.7-44 44-44h64c11.046 0 20 8.954 20 20v98c0 11.046-8.954 20-20 20H28c-11.046 0-20-8.954-20-20z"
  return (
    <svg viewBox="0 0 192 192" fill="none" role="img" aria-label="Google Meet" className={cn("size-5", className)}>
      <path
        fill={`url(#${id}a)`}
        d="M110.015 108.88c-6.829-4.718-6.921-14.778-.179-19.62L165 49.643c7.94-5.701 19-.038 19 9.737v77.755c0 9.675-10.861 15.359-18.821 9.859z"
      />
      <path fill={`url(#${id}b)`} d={body} />
      <mask id={`${id}e`} width="129" height="138" x="8" y="27" maskUnits="userSpaceOnUse" style={{ maskType: "luminance" }}>
        <path fill="#fff" d={body} />
      </mask>
      <g filter={`url(#${id}c)`} mask={`url(#${id}e)`}>
        <path fill={`url(#${id}f)`} d="m73.906 99.198 110-63.198v124z" />
      </g>
      <circle cx="38" cy="135" r="14" fill="#fff" />
      <defs>
        <linearGradient id={`${id}a`} x1="128.8" x2="227.2" y1="104.44" y2="104.44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f6a100" />
          <stop offset="1" stopColor="#ffbe00" />
        </linearGradient>
        <linearGradient id={`${id}f`} x1="136.22" x2="78.5" y1="91.32" y2="91.19" gradientUnits="userSpaceOnUse">
          <stop offset=".15" stopColor="#ffb5e8" />
          <stop offset="1" stopColor="#ffdbf5" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}b`} cx="0" cy="0" r="1" gradientTransform="matrix(-159.725 0 0 -135.852 160.325 96)" gradientUnits="userSpaceOnUse">
          <stop offset=".15" stopColor="#ffe921" />
          <stop offset="1" stopColor="#fec700" />
        </radialGradient>
        <filter id={`${id}c`} width="166" height="180" x="45.91" y="8" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur result="effect1_foregroundBlur_37584_9338" stdDeviation="14" />
        </filter>
      </defs>
    </svg>
  )
}

/** Google Sheets's logo, from thesvg.org `/icons/google-sheets/default.svg` (#195 to #201). */
export function GoogleSheetsLogo({ className }: { className?: string }) {
  const id = useSvgId()
  return (
    <svg viewBox="0 0 74 100" fill="none" role="img" aria-label="Google Sheets" className={cn("size-5", className)}><mask id={`${id}mask0_1_52`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1"><path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white"/></mask><g mask={`url(#${id}mask0_1_52)`}><path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L56.4365 16.8843L45.398 1.43036Z" fill="#0F9D58"/></g><mask id={`${id}mask1_1_52`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1"><path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white"/></mask><g mask={`url(#${id}mask1_1_52)`}><path d="M18.9054 48.8962V80.908H54.2288V48.8962H18.9054ZM34.3594 76.4926H23.3209V70.9733H34.3594V76.4926ZM34.3594 67.6617H23.3209V62.1424H34.3594V67.6617ZM34.3594 58.8309H23.3209V53.3116H34.3594V58.8309ZM49.8134 76.4926H38.7748V70.9733H49.8134V76.4926ZM49.8134 67.6617H38.7748V62.1424H49.8134V67.6617ZM49.8134 58.8309H38.7748V53.3116H49.8134V58.8309Z" fill="#F1F1F1"/></g><mask id={`${id}mask2_1_52`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1"><path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white"/></mask><g mask={`url(#${id}mask2_1_52)`}><path d="M47.3352 25.9856L71.8905 50.5354V27.9229L47.3352 25.9856Z" fill={`url(#${id}paint0_linear_1_52)`}/></g><mask id={`${id}mask3_1_52`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1"><path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white"/></mask><g mask={`url(#${id}mask3_1_52)`}><path d="M45.398 1.43036V21.2998C45.398 24.959 48.3618 27.9229 52.0211 27.9229H71.8905L45.398 1.43036Z" fill="#87CEAC"/></g><mask id={`${id}mask4_1_52`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1"><path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white"/></mask><g mask={`url(#${id}mask4_1_52)`}><path d="M7.86688 1.43036C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V8.60542C1.24374 4.9627 4.22415 1.98229 7.86688 1.98229H45.398V1.43036H7.86688Z" fill="white" fillOpacity="0.2"/></g><mask id={`${id}mask5_1_52`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1"><path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white"/></mask><g mask={`url(#${id}mask5_1_52)`}><path d="M65.2674 98.0177H7.86688C4.22415 98.0177 1.24374 95.0373 1.24374 91.3946V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V91.3946C71.8905 95.0373 68.9101 98.0177 65.2674 98.0177Z" fill="#263238" fillOpacity="0.2"/></g><mask id={`${id}mask6_1_52`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1"><path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill="white"/></mask><g mask={`url(#${id}mask6_1_52)`}><path d="M52.0211 27.9229C48.3618 27.9229 45.398 24.959 45.398 21.2998V21.8517C45.398 25.511 48.3618 28.4748 52.0211 28.4748H71.8905V27.9229H52.0211Z" fill="#263238" fillOpacity="0.1"/></g><path d="M45.398 1.43036H7.86688C4.22415 1.43036 1.24374 4.41077 1.24374 8.0535V91.9465C1.24374 95.5893 4.22415 98.5697 7.86688 98.5697H65.2674C68.9101 98.5697 71.8905 95.5893 71.8905 91.9465V27.9229L45.398 1.43036Z" fill={`url(#${id}paint1_radial_1_52)`}/><defs><linearGradient id={`${id}paint0_linear_1_52`} x1="59.6142" y1="28.0935" x2="59.6142" y2="50.5388" gradientUnits="userSpaceOnUse"><stop stopColor="#263238" stopOpacity="0.2"/><stop offset="1" stopColor="#263238" stopOpacity="0.02"/></linearGradient><radialGradient id={`${id}paint1_radial_1_52`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(3.48187 3.36121) scale(113.917)"><stop stopColor="white" stopOpacity="0.1"/><stop offset="1" stopColor="white" stopOpacity="0"/></radialGradient></defs></svg>
  )
}

/** Google Drive's logo, from thesvg.org `/icons/google-drive/default.svg` (#195 to #201). */
export function GoogleDriveLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 87.3 78" role="img" aria-label="Google Drive" className={cn("size-5", className)}><path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z"/><path fill="#00ac47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z"/><path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.798l5.852 11.5z"/><path fill="#00832d" d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"/><path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/><path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg>
  )
}

/** Google Docs's logo, from thesvg.org `/icons/google-docs/default.svg` (#195 to #201). */
export function GoogleDocsLogo({ className }: { className?: string }) {
  return (
    <svg fill="#4285F4" viewBox="0 0 24 24" role="img" aria-label="Google Docs" className={cn("size-5", className)}><path d="M14.727 6.727H14V0H4.91c-.905 0-1.637.732-1.637 1.636v20.728c0 .904.732 1.636 1.636 1.636h14.182c.904 0 1.636-.732 1.636-1.636V6.727h-6zm-.545 10.455H7.09v-1.364h7.09v1.364zm2.727-3.273H7.091v-1.364h9.818v1.364zm0-3.273H7.091V9.273h9.818v1.363zM14.727 6h6l-6-6v6z"/></svg>
  )
}

/** Slack's logo, from thesvg.org `/icons/slack/default.svg` (#195 to #201). */
export function SlackLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 2447.6 2452.5" role="img" aria-label="Slack" className={cn("size-5", className)}
><g clipRule="evenodd" fillRule="evenodd"><path d="m897.4 0c-135.3.1-244.8 109.9-244.7 245.2-.1 135.3 109.5 245.1 244.8 245.2h244.8v-245.1c.1-135.3-109.5-245.1-244.9-245.3.1 0 .1 0 0 0m0 654h-652.6c-135.3.1-244.9 109.9-244.8 245.2-.2 135.3 109.4 245.1 244.7 245.3h652.7c135.3-.1 244.9-109.9 244.8-245.2.1-135.4-109.5-245.2-244.8-245.3z" fill="#36c5f0"
    /><path d="m2447.6 899.2c.1-135.3-109.5-245.1-244.8-245.2-135.3.1-244.9 109.9-244.8 245.2v245.3h244.8c135.3-.1 244.9-109.9 244.8-245.3zm-652.7 0v-654c.1-135.2-109.4-245-244.7-245.2-135.3.1-244.9 109.9-244.8 245.2v654c-.2 135.3 109.4 245.1 244.7 245.3 135.3-.1 244.9-109.9 244.8-245.3z" fill="#2eb67d"
    /><path d="m1550.1 2452.5c135.3-.1 244.9-109.9 244.8-245.2.1-135.3-109.5-245.1-244.8-245.2h-244.8v245.2c-.1 135.2 109.5 245 244.8 245.2zm0-654.1h652.7c135.3-.1 244.9-109.9 244.8-245.2.2-135.3-109.4-245.1-244.7-245.3h-652.7c-135.3.1-244.9 109.9-244.8 245.2-.1 135.4 109.4 245.2 244.7 245.3z" fill="#ecb22e"
    /><path d="m0 1553.2c-.1 135.3 109.5 245.1 244.8 245.2 135.3-.1 244.9-109.9 244.8-245.2v-245.2h-244.8c-135.3.1-244.9 109.9-244.8 245.2zm652.7 0v654c-.2 135.3 109.4 245.1 244.7 245.3 135.3-.1 244.9-109.9 244.8-245.2v-653.9c.2-135.3-109.4-245.1-244.7-245.3-135.4 0-244.9 109.8-244.8 245.1 0 0 0 .1 0 0" fill="#e01e5a"
    /></g></svg>
  )
}

/** Discord's logo, from thesvg.org `/icons/discord/default.svg` (#195 to #201). */
export function DiscordLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 199" preserveAspectRatio="xMidYMid" role="img" aria-label="Discord" className={cn("size-5", className)}><path d="M216.856 16.597A208.502 208.502 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193A161.094 161.094 0 0 0 79.735 175.3a136.413 136.413 0 0 1-21.846-10.632 108.636 108.636 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a131.66 131.66 0 0 0 5.355 4.237 136.07 136.07 0 0 1-21.886 10.653c4.006 8.02 8.638 15.67 13.873 22.848 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.08-105.09-38.056-148.36ZM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18Zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18Z" fill="#5865F2"/></svg>
  )
}

/** Notion's logo, from thesvg.org `/icons/notion/default.svg` (#195 to #201). */
export function NotionLogo({ className }: { className?: string }) {
  return (
    <svg preserveAspectRatio="xMidYMid" viewBox="0 0 256 268" role="img" aria-label="Notion" className={cn("size-5", className)}><path fill="#FFF" d="M16.092 11.538 164.09.608c18.179-1.56 22.85-.508 34.28 7.801l47.243 33.282C253.406 47.414 256 48.975 256 55.207v182.527c0 11.439-4.155 18.205-18.696 19.24L65.44 267.378c-10.913.517-16.11-1.043-21.825-8.327L8.826 213.814C2.586 205.487 0 199.254 0 191.97V29.726c0-9.352 4.155-17.153 16.092-18.188Z"/><path d="M164.09.608 16.092 11.538C4.155 12.573 0 20.374 0 29.726v162.245c0 7.284 2.585 13.516 8.826 21.843l34.789 45.237c5.715 7.284 10.912 8.844 21.825 8.327l171.864-10.404c14.532-1.035 18.696-7.801 18.696-19.24V55.207c0-5.911-2.336-7.614-9.21-12.66l-1.185-.856L198.37 8.409C186.94.1 182.27-.952 164.09.608ZM69.327 52.22c-14.033.945-17.216 1.159-25.186-5.323L23.876 30.778c-2.06-2.086-1.026-4.69 4.163-5.207l142.274-10.395c11.947-1.043 18.17 3.12 22.842 6.758l24.401 17.68c1.043.525 3.638 3.637.517 3.637L71.146 52.095l-1.819.125Zm-16.36 183.954V81.222c0-6.767 2.077-9.887 8.3-10.413L230.02 60.93c5.724-.517 8.31 3.12 8.31 9.879v153.917c0 6.767-1.044 12.49-10.387 13.008l-161.487 9.361c-9.343.517-13.489-2.594-13.489-10.921ZM212.377 89.53c1.034 4.681 0 9.362-4.681 9.897l-7.783 1.542v114.404c-6.758 3.637-12.981 5.715-18.18 5.715-8.308 0-10.386-2.604-16.609-10.396l-50.898-80.079v77.476l16.1 3.646s0 9.362-12.989 9.362l-35.814 2.077c-1.043-2.086 0-7.284 3.63-8.318l9.351-2.595V109.823l-12.98-1.052c-1.044-4.68 1.55-11.439 8.826-11.965l38.426-2.585 52.958 81.113v-71.76l-13.498-1.552c-1.043-5.733 3.111-9.896 8.3-10.404l35.84-2.087Z"/></svg>
  )
}

/** Outlook's logo, from thesvg.org `/icons/microsoft-outlook/default.svg` (#195 to #201). */
export function OutlookLogo({ className }: { className?: string }) {
  const id = useSvgId()
  return (
    <svg viewBox="60 90.4 570.02 539.67" role="img" aria-label="Outlook" className={cn("size-5", className)}><defs><linearGradient id={`${id}a`} x1="9.989" x2="30.932" y1="22.365" y2="9.375" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse"><stop offset="0" style={{ stopColor: "#20a7fa", stopOpacity: "1" }}/><stop offset=".4" style={{ stopColor: "#3bd5ff", stopOpacity: "1" }}/><stop offset="1" style={{ stopColor: "#c4b0ff", stopOpacity: "1" }}/></linearGradient><linearGradient id={`${id}b`} x1="17.197" x2="28.856" y1="26.794" y2="8.126" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse"><stop offset="0" style={{ stopColor: "#165ad9", stopOpacity: "1" }}/><stop offset=".501" style={{ stopColor: "#1880e5", stopOpacity: "1" }}/><stop offset="1" style={{ stopColor: "#8587ff", stopOpacity: "1" }}/></linearGradient><linearGradient id={`${id}c`} x1="25.701" x2="12.756" y1="27.048" y2="16.501" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse"><stop offset=".237" style={{ stopColor: "#448aff", stopOpacity: "0" }}/><stop offset=".792" style={{ stopColor: "#0032b1", stopOpacity: ".2" }}/></linearGradient><linearGradient id={`${id}d`} x1="24.053" x2="44.51" y1="31.11" y2="18.018" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse"><stop offset="0" style={{ stopColor: "#1a43a6", stopOpacity: "1" }}/><stop offset=".492" style={{ stopColor: "#2052cb", stopOpacity: "1" }}/><stop offset="1" style={{ stopColor: "#5f20cb", stopOpacity: "1" }}/></linearGradient><linearGradient id={`${id}e`} x1="29.828" x2="17.397" y1="30.327" y2="19.571" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse"><stop offset="0" style={{ stopColor: "#0045b9", stopOpacity: "0" }}/><stop offset=".67" style={{ stopColor: "#0d1f69", stopOpacity: ".2" }}/></linearGradient><linearGradient id={`${id}g`} x1="41.998" x2="23.852" y1="29.943" y2="29.943" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse"><stop offset="0" style={{ stopColor: "#4dc4ff", stopOpacity: "1" }}/><stop offset=".196" style={{ stopColor: "#0fafff", stopOpacity: "1" }}/></linearGradient><linearGradient id={`${id}k`} x1="3.458" x2="20.929" y1="37.872" y2="37.86" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse"><stop offset=".206" style={{ stopColor: "#6ce0ff", stopOpacity: "1" }}/><stop offset=".535" style={{ stopColor: "#50d5ff", stopOpacity: "0" }}/></linearGradient><radialGradient id={`${id}f`} cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(0 -405.04051 438.393 0 360.027 102.268)" gradientUnits="userSpaceOnUse"><stop offset=".568" style={{ stopColor: "#275ff0", stopOpacity: "0" }}/><stop offset=".992" style={{ stopColor: "#002177", stopOpacity: "1" }}/></radialGradient><radialGradient id={`${id}h`} cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="scale(173.58) rotate(-45 5.168 -1.292)" gradientUnits="userSpaceOnUse"><stop offset=".259" style={{ stopColor: "#0060d1", stopOpacity: ".4" }}/><stop offset=".908" style={{ stopColor: "#0383f1", stopOpacity: "0" }}/></radialGradient><radialGradient id={`${id}i`} cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(357.40702 -468.44593 423.59457 323.18709 159.471 697.08)" gradientUnits="userSpaceOnUse"><stop offset=".732" style={{ stopColor: "#f4a7f7", stopOpacity: "0" }}/><stop offset="1" style={{ stopColor: "#f4a7f7", stopOpacity: ".501961" }}/></radialGradient><radialGradient id={`${id}j`} cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(-170.86087 259.7254 -674.01813 -443.40415 278.562 412.979)" gradientUnits="userSpaceOnUse"><stop offset="0" style={{ stopColor: "#49deff", stopOpacity: "1" }}/><stop offset=".724" style={{ stopColor: "#29c3ff", stopOpacity: "1" }}/></radialGradient><radialGradient id={`${id}l`} cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="rotate(46.924 -378.504 245.25) scale(315.927)" gradientUnits="userSpaceOnUse"><stop offset=".039" style={{ stopColor: "#0091ff", stopOpacity: "1" }}/><stop offset=".919" style={{ stopColor: "#183dad", stopOpacity: "1" }}/></radialGradient><radialGradient id={`${id}m`} cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(0 168 -193.782 0 180 491.159)" gradientUnits="userSpaceOnUse"><stop offset=".558" style={{ stopColor: "#0fa5f7", stopOpacity: "0" }}/><stop offset="1" style={{ stopColor: "#74c6ff", stopOpacity: ".501961" }}/></radialGradient></defs><path d="m463.984 140.145-344.347 218.27-29.614-46.72v-40.257a43.26 43.26 0 0 1 19.72-36.293L309.91 105.258c30.496-19.79 69.777-19.793 100.277-.008Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}a)` }}/><path d="M407.102 103.34a91.293 91.293 0 0 1 3.082 1.914l156.214 101.332-387.336 245.52-59.437-93.77L403.895 177.8c26.925-17.102 28.105-55.57 3.207-74.461Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}b)` }}/><path d="M407.102 103.34a91.293 91.293 0 0 1 3.082 1.914l156.214 101.332-387.336 245.52-59.437-93.77L403.895 177.8c26.925-17.102 28.105-55.57 3.207-74.461Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}c)` }}/><path d="M333.602 498.988 179.066 452.11 507.63 243.836c27.672-17.54 27.601-57.938-.133-75.379l-1.48-.93 4.261 2.649 99.996 64.867a43.263 43.263 0 0 1 19.723 36.3v38.962Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}d)` }}/><path d="M333.602 498.988 179.066 452.11 507.63 243.836c27.672-17.54 27.601-57.938-.133-75.379l-1.48-.93 4.261 2.649 99.996 64.867a43.263 43.263 0 0 1 19.723 36.3v38.962Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}e)` }}/><path d="M410.188 105.25c-30.5-19.785-69.782-19.781-100.282.008L109.742 235.145a43.26 43.26 0 0 0-19.719 36.292v1.97a44.479 44.479 0 0 0 20.735 36.16l248.887 156.91L609.16 309.805a44.468 44.468 0 0 0 20.824-37.664v38.168l.008-38.965c0-14.66-7.426-28.32-19.722-36.301Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}f)` }}/><path d="M315.77 630.05h220.449c51.777 0 93.75-41.972 93.75-93.75V272.14c0 15.301-7.864 29.528-20.82 37.665l-327.907 205.89a60.712 60.712 0 0 0-28.422 51.414c.004 34.762 28.184 62.942 62.95 62.942Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}g)` }}/><path d="M315.77 630.05h220.449c51.777 0 93.75-41.972 93.75-93.75V272.14c0 15.301-7.864 29.528-20.82 37.665l-327.907 205.89a60.712 60.712 0 0 0-28.422 51.414c.004 34.762 28.184 62.942 62.95 62.942Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}h)` }}/><path d="M315.77 630.05h220.449c51.777 0 93.75-41.972 93.75-93.75V272.14c0 15.301-7.864 29.528-20.82 37.665l-327.907 205.89a60.712 60.712 0 0 0-28.422 51.414c.004 34.762 28.184 62.942 62.95 62.942Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}i)` }}/><path d="M405.402 630.035H183.738c-51.777 0-93.75-41.972-93.75-93.75v-264.34a44.473 44.473 0 0 0 20.754 37.621l327.582 206.52a61.737 61.737 0 0 1 28.809 52.226c-.004 34.09-27.64 61.723-61.73 61.723Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}j)` }}/><path d="M405.402 630.035H183.738c-51.777 0-93.75-41.972-93.75-93.75v-264.34a44.473 44.473 0 0 0 20.754 37.621l327.582 206.52a61.737 61.737 0 0 1 28.809 52.226c-.004 34.09-27.64 61.723-61.73 61.723Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}k)` }}/><path d="M108.75 345h142.5c26.926 0 48.75 21.824 48.75 48.75v142.5c0 26.926-21.824 48.75-48.75 48.75h-142.5C81.824 585 60 563.176 60 536.25v-142.5C60 366.824 81.824 345 108.75 345Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}l)` }}/><path d="M108.75 345h142.5c26.926 0 48.75 21.824 48.75 48.75v142.5c0 26.926-21.824 48.75-48.75 48.75h-142.5C81.824 585 60 563.176 60 536.25v-142.5C60 366.824 81.824 345 108.75 345Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: `url(#${id}m)` }}/><path d="M179.387 534c-19.848 0-36.137-6.21-48.875-18.625-12.739-12.414-19.11-28.617-19.11-48.605 0-21.11 6.465-38.18 19.395-51.22C143.73 402.517 160.66 396 181.594 396c19.781 0 35.879 6.238 48.297 18.715 12.484 12.476 18.726 28.93 18.726 49.351 0 20.985-6.469 37.899-19.398 50.75C216.352 527.606 199.742 534 179.387 534Zm.574-26.352c10.816 0 19.523-3.695 26.117-11.082 6.594-7.386 9.89-17.664 9.89-30.824 0-13.719-3.202-24.394-9.6-32.031-6.403-7.637-14.95-11.453-25.638-11.453-11.011 0-19.878 3.941-26.597 11.824-6.723 7.824-10.082 18.191-10.082 31.102 0 13.101 3.36 23.468 10.082 31.101 6.719 7.574 15.328 11.363 25.828 11.363Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: "#fff", fillOpacity: "1" }}/><path d="M179.332 535.848c-19.77 0-36-6.375-48.691-19.13-12.688-12.753-19.036-29.398-19.036-49.929 0-21.684 6.442-39.219 19.325-52.61 12.882-13.394 29.75-20.09 50.601-20.09 19.703 0 35.742 6.411 48.114 19.227 12.437 12.82 18.652 29.72 18.652 50.7 0 21.55-6.442 38.93-19.32 52.129-12.82 13.136-29.368 19.703-49.645 19.703Zm.57-27.067c10.778 0 19.453-3.797 26.02-11.383 6.57-7.59 9.851-18.144 9.851-31.664 0-14.093-3.187-25.058-9.562-32.902-6.379-7.844-14.89-11.766-25.54-11.766-10.972 0-19.804 4.047-26.5 12.149-6.694 8.031-10.042 18.683-10.042 31.945 0 13.457 3.348 24.106 10.043 31.95 6.695 7.78 15.273 11.671 25.73 11.671Zm0 0" style={{ stroke: "none", fillRule: "nonzero", fill: "#fff", fillOpacity: "1" }}/></svg>
  )
}

/** HubSpot's logo, from thesvg.org `/icons/hubspot/default.svg` (#195 to #201). */
export function HubSpotLogo({ className }: { className?: string }) {
  return (
    <svg fill="#FF7A59" viewBox="0 0 24 24" role="img" aria-label="HubSpot" className={cn("size-5", className)}><path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.193v.067a2.196 2.196 0 001.252 1.973l.013.006v2.852a6.22 6.22 0 00-2.969 1.31l.012-.01-7.828-6.095A2.497 2.497 0 104.3 4.656l-.012.006 7.697 5.991a6.176 6.176 0 00-1.038 3.446c0 1.343.425 2.588 1.147 3.607l-.013-.02-2.342 2.343a1.968 1.968 0 00-.58-.095h-.002a2.033 2.033 0 102.033 2.033 1.978 1.978 0 00-.1-.595l.005.014 2.317-2.317a6.247 6.247 0 104.782-11.134l-.036-.005zm-.964 9.378a3.206 3.206 0 113.215-3.207v.002a3.206 3.206 0 01-3.207 3.207z"/></svg>
  )
}

/**
 * Zoom's 2025 app icon: the white "zoom" wordmark on Zoom's blue rounded square (Ancung, 11 Nov:
 * the lone "Z" from thesvg.org `/icons/zoom/default.svg` read as nothing anyone knew). The SVG
 * Ancung pasted, copied as is; only the gradient id is made unique per use, as for the others.
 */
export function ZoomLogo({ className }: { className?: string }) {
  const id = useSvgId()
  return (
    <svg viewBox="0 0 512 512" role="img" aria-label="Zoom" className={cn("size-5", className)}>
      <defs>
        <linearGradient id={`${id}a`} x1="0" x2="1" y1="0" y2="0" gradientTransform="rotate(-60 88.792 30.85)scale(109.282)" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0845bf" />
          <stop offset=".6" stopColor="#0b5cff" />
          <stop offset="1" stopColor="#4f90ee" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id}a)`}
        d="M84.06 37.19V52.8c0 17.25-14 31.25-31.25 31.25H37.2c-17.25 0-31.25-14-31.25-31.25V37.2c0-17.25 14-31.25 31.25-31.25h15.6c17.25 0 31.25 14 31.25 31.25"
        transform="matrix(6.4 0 0 6.4 -32 -32)"
      />
      <path
        fill="#fff"
        d="M152.08 295.51H88.07c-4.49 0-8.5-2.67-10.22-6.82a11.05 11.05 0 0 1 2.4-12.07l44.33-44.33H92.81a15.8 15.8 0 0 1-15.8-15.8h59.02c4.5 0 8.5 2.68 10.22 6.83a11 11 0 0 1-2.4 12.05l-44.33 44.34h36.75a15.8 15.8 0 0 1 15.81 15.8M435 246.11a30.86 30.86 0 0 0-30.82-30.81 30.8 30.8 0 0 0-22.92 10.24 30.8 30.8 0 0 0-22.92-10.24 30.86 30.86 0 0 0-30.82 30.82v49.4a15.8 15.8 0 0 0 15.8-15.81v-33.6a15.03 15.03 0 0 1 30.03 0v33.6a15.8 15.8 0 0 0 15.81 15.8v-49.4a15.03 15.03 0 0 1 30.04 0v33.6a15.8 15.8 0 0 0 15.8 15.8zm-115.38 9.9a40.7 40.7 0 1 1-81.4-.01 40.7 40.7 0 0 1 81.4 0m-15.8 0a24.9 24.9 0 1 0-49.8-.01 24.9 24.9 0 0 0 49.8 0m-71.92 0a40.7 40.7 0 1 1-81.4 0 40.7 40.7 0 0 1 81.4 0m-15.8 0a24.9 24.9 0 1 0-49.8-.01 24.9 24.9 0 0 0 49.8 0"
      />
    </svg>
  )
}

/** Telegram's logo (#172), from thesvg.org `/icons/telegram/default.svg`. */
export function TelegramLogo({ className }: { className?: string }) {
  const id = useSvgId()
  return (
    <svg viewBox="0 0 256 256" preserveAspectRatio="xMidYMid" role="img" aria-label="Telegram" className={cn("size-5", className)}>
      <defs>
        <linearGradient id={`${id}a`} x1="50%" x2="50%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#2AABEE" />
          <stop offset="100%" stopColor="#229ED9" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id}a)`}
        d="M128 0C94.06 0 61.48 13.494 37.5 37.49A128.038 128.038 0 0 0 0 128c0 33.934 13.5 66.514 37.5 90.51C61.48 242.506 94.06 256 128 256s66.52-13.494 90.5-37.49c24-23.996 37.5-56.576 37.5-90.51 0-33.934-13.5-66.514-37.5-90.51C194.52 13.494 161.94 0 128 0Z"
      />
      <path
        fill="#FFF"
        d="M57.94 126.648c37.32-16.256 62.2-26.974 74.64-32.152 35.56-14.786 42.94-17.354 47.76-17.441 1.06-.017 3.42.245 4.96 1.49 1.28 1.05 1.64 2.47 1.82 3.467.16.996.38 3.266.2 5.038-1.92 20.24-10.26 69.356-14.5 92.026-1.78 9.592-5.32 12.808-8.74 13.122-7.44.684-13.08-4.912-20.28-9.63-11.26-7.386-17.62-11.982-28.56-19.188-12.64-8.328-4.44-12.906 2.76-20.386 1.88-1.958 34.64-31.748 35.26-34.45.08-.338.16-1.598-.6-2.262-.74-.666-1.84-.438-2.64-.258-1.14.256-19.12 12.152-54 35.686-5.1 3.508-9.72 5.218-13.88 5.128-4.56-.098-13.36-2.584-19.9-4.708-8-2.606-14.38-3.984-13.82-8.41.28-2.304 3.46-4.662 9.52-7.072Z"
      />
    </svg>
  )
}

export function MeteorLogo({ className }: { className?: string }) {
  const id = useSvgId()
  return (
    <svg viewBox="0 0 400.04 400.04" role="img" aria-label="Meteor Wallet" className={cn("size-5", className)}>
      <defs>
        <linearGradient id={`${id}a`} x1="215.39" y1="239.47" x2="382.38" y2="239.47" gradientTransform="translate(-122.96 -148.16)" gradientUnits="userSpaceOnUse">
          <stop offset=".07" stopColor="#0f0f36" />
          <stop offset=".76" stopColor="#232371" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="285.49" y1="335.04" x2="469.44" y2="335.04" gradientTransform="translate(-78.4 -231.71)" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0f0f36" />
          <stop offset=".8" stopColor="#232371" />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="298.99" y1="428.49" x2="366.74" y2="428.49" gradientTransform="translate(.74 -227.54)" gradientUnits="userSpaceOnUse">
          <stop offset=".07" stopColor="#0f0f36" />
          <stop offset=".76" stopColor="#232371" />
        </linearGradient>
        <linearGradient id={`${id}d`} x1="36.6" y1="332.92" x2="431.62" y2="332.92" gradientTransform="rotate(-45 58.56 313.83)" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#479ff5" />
          <stop offset=".22" stopColor="#405ee5" />
          <stop offset=".35" stopColor="#523bda" />
          <stop offset=".43" stopColor="#5a55ce" />
          <stop offset=".56" stopColor="#5a55ce" />
          <stop offset=".76" stopColor="#3b3cbb" />
          <stop offset=".87" stopColor="#171e9b" />
          <stop offset="1" stopColor="#171e9b" />
        </linearGradient>
      </defs>
      <path d="M105 65.29h128.39a26 26 0 0 1 26 26 26 26 0 0 1-26 26H105a12.54 12.54 0 0 1-12.57-12.49v-27A12.54 12.54 0 0 1 105 65.29Z" transform="rotate(-45 175.92 91.31)" fill={`url(#${id}a)`} />
      <path d="M220.2 76.74h144.24A26.59 26.59 0 0 1 391 103.33a26.59 26.59 0 0 1-26.59 26.59H220.2a13.11 13.11 0 0 1-13.11-13.11v-27a13.11 13.11 0 0 1 13.11-13.07Z" transform="rotate(-45 299.06 103.33)" fill={`url(#${id}b)`} />
      <rect x="299.73" y="176.9" width="67.75" height="48.08" rx="24.04" transform="rotate(-45 333.6 200.95)" fill={`url(#${id}c)`} />
      <path
        d="m339.09 99.35-64.8 64.8a25.5 25.5 0 0 1-36.05 0 25.49 25.49 0 0 1 0-36L252 114.37c8.68-8.69 9.33-22.93.81-31.77a22.3 22.3 0 0 0-31.81-.29l-60.82 60.83a25.49 25.49 0 0 1-36 0 25.5 25.5 0 0 1 0-36.06l20.26-20.27a22.31 22.31 0 0 0-.3-31.83c-8.84-8.52-23.08-7.86-31.76.82l-55 55c-.26.25-.48.53-.72.79A163.53 163.53 0 0 0 287.8 342.86l-.2-.2c.26-.24.53-.46.79-.72l97.09-97.09c8.68-8.68 9.34-22.92.81-31.76a22.31 22.31 0 0 0-31.83-.3s18.18-18.15-9.8 9.86a23.25 23.25 0 0 1-32.9 0 23.25 23.25 0 0 1 0-32.9l59.39-59.39a22.31 22.31 0 0 0-.3-31.83c-8.85-8.53-23.08-7.86-31.76.82Z"
        fill={`url(#${id}d)`}
      />
      <rect x="62.59" y="94.34" width="50.97" height="25.49" rx="12.74" transform="rotate(-45 88.07 107.1)" fill="#a4a1ef" />
      <circle cx="124.11" cy="71.04" r="12.74" fill="#c2bffc" />
      <rect x="208.62" y="89.84" width="38.23" height="25.49" rx="12.74" transform="rotate(-45 227.74 102.58)" fill="#786bee" />
    </svg>
  )
}
