// A cron line in plain words (design P1.1: "Every day at 08:00", "Weekdays at 07:30", "Every
// hour"). Only the shapes the ready ideas and a simple Builder make are worded; anything else
// says it runs on a custom schedule instead of guessing.

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const two = (n: number) => String(n).padStart(2, "0")

export function scheduleText(cron: string | null | undefined): string {
  if (!cron) return "No schedule"
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return "On a custom schedule"
  const [min, hour, dom, mon, dow] = parts
  if (/^\d+$/.test(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") return min === "0" ? "Every hour" : `Every hour at :${two(Number(min))}`
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hour) || dom !== "*" || mon !== "*") return "On a custom schedule"
  const at = `${two(Number(hour))}:${two(Number(min))}`
  if (dow === "*") return `Every day at ${at}`
  if (dow === "1-5") return `Weekdays at ${at}`
  if (dow === "0,6" || dow === "6,0") return `Weekends at ${at}`
  if (/^[0-6]$/.test(dow)) return `Every ${DAYS[Number(dow)]} at ${at}`
  return "On a custom schedule"
}

/** "Asia/Jakarta" -> "Jakarta", for "Jakarta time". */
export function zoneName(timezone: string | null | undefined): string {
  if (!timezone || timezone === "UTC") return "UTC"
  return timezone.split("/").pop()!.replace(/_/g, " ")
}

/** "today 08:00", "tomorrow 08:00", "Monday 07:30", or "12 Nov, 08:00", on this device's clock. */
export function whenNext(iso: string | null | undefined, now = new Date()): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(d) - day(now)) / 86_400_000)
  if (diff === 0) return `today ${time}`
  if (diff === 1) return `tomorrow ${time}`
  if (diff > 1 && diff < 7) return `${DAYS[d.getDay()]} ${time}`
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}, ${time}`
}
