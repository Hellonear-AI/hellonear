import Link from "next/link"
import { CheckIcon, CircleDashedIcon, XIcon } from "lucide-react"
import { cn } from "cn"
import { mindHref } from "@/components/layout/nav"
import type { SkillLine } from "@/modules/skills/data/skills"

/** A skill's "Can use" lines: a check, a cross, or a dashed circle with Connect for an app not connected yet. */
export function SkillLines({ mindId, lines, size = "sm" }: { mindId: string; lines: SkillLine[]; size?: "sm" | "md" }) {
  const icon = size === "md" ? "size-4" : "size-3.5"
  return (
    <ul className="flex flex-col gap-1.5">
      {lines.map(({ t, tone, connect }) => (
        <li key={t} className={cn("flex items-start gap-2 text-foreground", size === "md" ? "text-sm" : "text-[13px]", tone === "off" && "text-muted-foreground")}>
          {tone === "ok" ? (
            <CheckIcon className={cn("mt-0.5 shrink-0 text-success", icon)} />
          ) : tone === "no" ? (
            <XIcon className={cn("mt-0.5 shrink-0 text-danger", icon)} />
          ) : (
            <CircleDashedIcon className={cn("mt-0.5 shrink-0", icon)} />
          )}
          <span>
            {t}
            {connect && (
              <>
                {" "}
                <Link href={mindHref(mindId, "connections")} className="rounded-sm font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus">
                  Connect
                </Link>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
