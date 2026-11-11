"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"

/** How many pages `count` items fill at `perPage` each. */
export const pageCount = (count: number, perPage: number) => Math.max(1, Math.ceil(count / perPage))

/**
 * Previous, the page numbers and Next, centred under a list. Hidden when everything fits on one
 * page. Built on our Button (shadcn's Pagination isn't installed; this needs no more than this).
 */
export function Pager({ page, pages, onPage, label, className }: { page: number; pages: number; onPage: (page: number) => void; label: string; className?: string }) {
  if (pages <= 1) return null
  return (
    <nav aria-label={label} className={cn("flex items-center justify-center gap-1", className)}>
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <ChevronLeftIcon />
        <span className="max-sm:sr-only">Previous</span>
      </Button>
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
        <Button
          key={n}
          variant={n === page ? "secondary" : "ghost"}
          size="icon-sm"
          // 36 px, a comfortable tap (the phone check, 11 Nov: 32 px was small next to Previous).
          className="size-9"
          aria-label={`Page ${n}`}
          aria-current={n === page ? "page" : undefined}
          onClick={() => onPage(n)}
        >
          {n}
        </Button>
      ))}
      <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
        <span className="max-sm:sr-only">Next</span>
        <ChevronRightIcon />
      </Button>
    </nav>
  )
}
