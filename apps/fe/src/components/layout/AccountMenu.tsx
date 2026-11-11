"use client"

import { ChevronsUpDownIcon, ListChecksIcon, LogOutIcon, MonitorIcon, MoonIcon, SettingsIcon, SunIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { cn } from "cn"
import { OwnerAvatar } from "@/components/elements/MindAvatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSession, useSignOut } from "@/modules/auth/hooks/useSession"
import { setFlag, useFlag } from "@/modules/onboarding/data/progress"

const THEMES = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const

/**
 * Account menu (design N1.8): who is signed in, Appearance for the whole app, Sign out last.
 * Opens from the sidebar's account row, the rail avatar, or the gear in the phone drawer.
 */
export function AccountMenu({ variant }: { variant: "row" | "avatar" | "icon" }) {
  const { data: user } = useSession()
  const signOut = useSignOut()
  const { theme = "system", setTheme } = useTheme()
  const router = useRouter()
  const signedAccountId = user?.nearAccountId
  const hiddenGuide = useFlag("done")
  const account = signedAccountId ?? "Not signed in"

  function handleSignOut() {
    // replace, not push: the signed-out page shouldn't stay in Back's history.
    signOut.mutate(undefined, { onSettled: () => router.replace("/") })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account and appearance"
        className={cn(
          variant === "row" &&
            "flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-surface-hover aria-expanded:bg-surface-hover",
          variant === "avatar" && "rounded-full transition-transform active:scale-[0.97]",
          variant === "icon" &&
            "flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        )}
      >
        {variant === "icon" ? (
          <SettingsIcon className="size-[18px]" />
        ) : (
          <OwnerAvatar accountId={account} />
        )}
        {variant === "row" && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-tertiary-foreground">
                {signedAccountId ? "Signed in" : "Wallet"}
              </span>
              <span className="block truncate font-mono text-xs">{account}</span>
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 text-tertiary-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "row" ? "top" : variant === "avatar" ? "right" : "bottom"}
        align={variant === "icon" ? "end" : "start"}
        className={cn("p-1.5", variant === "row" ? "w-(--anchor-width)" : "w-64")}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-xs text-tertiary-foreground">Signed in as</span>
            <span className="truncate font-mono text-xs text-foreground">{account}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(String(value))}>
            {THEMES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem key={value} value={value} className="p-2">
                <Icon />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {hiddenGuide && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="p-2" onClick={() => setFlag("done", false)}>
              <ListChecksIcon />
              Show Getting started
            </DropdownMenuItem>
          </>
        )}
        {signedAccountId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="p-2" onClick={handleSignOut}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
