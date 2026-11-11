import { Loader2Icon } from "lucide-react"
import { cn } from "cn"

/** The busy spinner in buttons and rows; still with reduced motion. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2Icon aria-hidden className={cn("animate-spin motion-reduce:animate-none", className)} />
}
