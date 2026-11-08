import Image from "next/image"
import Link from "next/link"
import { CheckIcon, MessageCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { mindHref } from "@/components/layout/nav"
import { templateImage } from "@/modules/minds/data/minds"

// L3.5: one calm moment that repeats the limits in words, then straight into the chat.
export function MindReady({
  mindId,
  name,
  templateId,
  perTransactionNear,
}: {
  mindId: string
  name: string
  templateId: string
  /** From the wallet read back after signing, not from the form. */
  perTransactionNear: string
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 py-12 text-center">
      <span className="relative size-28 overflow-hidden rounded-full bg-muted animate-in fade-in-0 zoom-in-90 duration-500 ease-out motion-reduce:animate-none md:size-32">
        <Image src={templateImage(templateId)} alt="" fill sizes="128px" className="object-cover" priority />
      </span>
      <div className="flex max-w-md flex-col gap-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out motion-reduce:animate-none">
        <h1 className="text-[30px] leading-tight font-medium tracking-tight text-foreground md:text-[40px]">{name} is ready</h1>
        <p className="text-[15px] text-muted-foreground md:text-base">
          {name} asks you before every payment: up to {perTransactionNear} NEAR each, only to the addresses you added. Anything
          else is blocked.
        </p>
      </div>
      <p className="flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-[13px] font-medium text-success">
        <CheckIcon className="size-3.5" />
        Limits saved where {name} can&apos;t change them
      </p>
      <Button nativeButton={false} render={<Link href={mindHref(mindId)} />} className="mt-1">
        <MessageCircleIcon />
        Say hi to {name}
      </Button>
    </main>
  )
}
