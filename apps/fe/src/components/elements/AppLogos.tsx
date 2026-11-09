import { useId } from "react"
import { cn } from "cn"

// Google's 2026 Gmail, Google Calendar and Google Meet icons, shown where an app is connected or
// needed so people recognise it at a glance (Ancung, 9 Nov; the design had a one-colour Gmail).
// Paths and gradients copied as is from thesvg.org (`/icons/gmail-2026/default.svg`,
// `/icons/google-calendar-2026/default.svg`, `/icons/google-meet-2026/default.svg`, read 9 Nov:
// paths, gradients, masks and blurs, nothing else). Gmail, Google Calendar and Google Meet are
// Google trademarks, used here to name the apps.
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
