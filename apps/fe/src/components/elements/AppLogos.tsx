import { cn } from "cn"

// App logos from the design (`Logo/Gmail` in design/hellonear.pen, exported as is). Shown where an
// app is connected or needed, so people recognise it at a glance. Don't redraw or recolour.

export function GmailLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 13.2672" role="img" aria-label="Gmail" className={cn("h-auto w-5", className)}>
      <path
        transform="translate(0 -0.3666)"
        d="M18 2.179v10.249c0 .666-.549 1.205-1.227 1.205h-2.864v-6.832l-4.909 3.618-4.909-3.618v6.833h-2.864q-.244 0-.47-.092-.225-.092-.398-.262-.172-.169-.266-.391-.093-.222-.093-.461v-10.249c0-1.491 1.732-2.342 2.945-1.447l1.146 .845 4.909 3.616 4.909-3.618 1.146-.843c1.212-.894 2.945-.044 2.945 1.447z"
        fill="#ea4335"
      />
    </svg>
  )
}
