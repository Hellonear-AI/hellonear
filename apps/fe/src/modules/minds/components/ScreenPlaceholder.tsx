import { PageTitle } from "@/components/elements/PageTitle"

// Stand-in for screens that are not built yet, so the app shell can be tried end to end.
export function ScreenPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 xl:p-8">
      <PageTitle title={title} description={description} />
      <div className="flex min-h-80 flex-1 items-center justify-center rounded-lg border border-dashed border-border-strong p-8 text-center text-sm text-muted-foreground">
        This screen comes next.
      </div>
    </div>
  )
}
