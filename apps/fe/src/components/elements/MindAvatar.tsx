import Image from "next/image"
import { cn } from "cn"
import { TEMPLATE_IMAGE, type MindTemplate } from "@/modules/minds/data/minds"

// Avatar/Mind (40) and Avatar/Mind large (64) from the design: the template's character in a circle.
export function MindAvatar({
  templateId,
  size = 40,
  className,
}: {
  templateId: MindTemplate
  size?: 24 | 32 | 40 | 64
  className?: string
}) {
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden rounded-full bg-muted", className)}
      style={{ width: size, height: size }}
    >
      <Image src={TEMPLATE_IMAGE[templateId]} alt="" fill sizes={`${size}px`} className="object-cover" />
    </span>
  )
}

// Avatar/Owner (32): the owner's initials.
export function OwnerAvatar({ accountId, className }: { accountId: string; className?: string }) {
  const initials = accountId.replace(/\.(testnet|near)$/, "").slice(0, 2).toUpperCase()
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground",
        className
      )}
    >
      {initials}
    </span>
  )
}
