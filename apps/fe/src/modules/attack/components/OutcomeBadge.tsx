"use client"

import {
  HourglassIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { type Outcome } from "@/modules/attack/data/outcome"

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  switch (outcome.kind) {
    case "running":
    case "answering":
      return <Badge variant="neutral">Running</Badge>
    case "waiting":
      return (
        <Badge variant="warning">
          <HourglassIcon />
          Waiting
        </Badge>
      )
    case "declined":
      return <Badge variant="success">Declined</Badge>
    case "blocked":
      return <Badge variant="success">Blocked</Badge>
    case "refused":
      return <Badge variant="success">Refused</Badge>
    case "no_tool":
      return <Badge variant="success">Could not pay</Badge>
    case "sent":
      return <Badge variant="destructive">Paid</Badge>
    case "failed":
      return <Badge variant="neutral">Didn&apos;t run</Badge>
  }
}
