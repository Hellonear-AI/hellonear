import { DeleteBlock } from "@/modules/builder/components/panels/DeleteBlock"
import { PanelHead } from "@/modules/builder/components/panels/PanelHead"
import { KIND_META } from "@/modules/builder/data/blocks"

export function EndPanel({ onDelete }: { onDelete: () => void }) {
  const { tone, Icon } = KIND_META.end
  return (
    <>
      <PanelHead tone={tone} icon={<Icon />} title="End" />
      <p className="text-sm text-muted-foreground">The job stops here on this path. Nothing after it runs.</p>
      <DeleteBlock onClick={onDelete} />
    </>
  )
}
