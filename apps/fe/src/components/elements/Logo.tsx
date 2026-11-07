import { cn } from "cn"

// Nabil's logo files (design/logo, #60), used as they are: the README says not to redraw or recolour.
// The app theme is a class on <html>, so we swap the dark and light files with `dark:` instead of
// relying on the files' own prefers-color-scheme, which follows the OS, not the account menu.

/** Mark + "HelloNEAR" wordmark (viewBox 983 x 196). */
export function Logo({ height = 32, className }: { height?: number; className?: string }) {
  const width = Math.round((983 / 196) * height)
  return (
    <span className={cn("relative block shrink-0", className)} style={{ width, height }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs, no optimisation needed */}
      <img src="/logo/hellonear-logo-dark.svg" alt="HelloNear" width={width} height={height} className="block dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/hellonear-logo-light.svg" alt="HelloNear" width={width} height={height} className="hidden dark:block" />
    </span>
  )
}

/** App icon tile (stone in light mode, dark in dark mode), for the rail. */
export function LogoIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("relative block shrink-0", className)} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/hellonear-icon-on-stone.svg" alt="HelloNear" width={size} height={size} className="block rounded-[22%] dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/hellonear-icon-on-dark.svg" alt="HelloNear" width={size} height={size} className="hidden rounded-[22%] dark:block" />
    </span>
  )
}
