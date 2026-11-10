import { Trash2Icon } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

export function DeleteBlock({ onClick, children = "Delete this block" }: { onClick: () => void; children?: ReactNode }) {
  return (
    <Button variant="outline" className="w-fit text-danger" onClick={onClick}>
      <Trash2Icon />
      {children}
    </Button>
  )
}
