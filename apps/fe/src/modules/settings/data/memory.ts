// A Mind's working memory as Settings shows it (#209). The engine keeps it as free Markdown that the
// Mind writes itself (no fixed template), so the page groups it by the document's own headings.

export type MemorySection = {
  /** The heading text, or null for lines before the first heading. */
  title: string | null
  /** One row per non-empty line, without list markers or emphasis marks. */
  rows: string[]
}

/** "**Name**: Sam" -> "Name: Sam"; inline code, bold, italics and links read as plain text. */
function plain(line: string): string {
  return line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_]+)[*_](?=[^\w*]|$)/g, "$1$2")
    .trim()
}

/**
 * Splits the document at its headings (any level). List markers are dropped, and a field the Mind
 * left blank ("- **Location**:", as Mastra's default template starts) is not a row. Sections with
 * no rows are left out.
 */
export function memorySections(markdown: string): MemorySection[] {
  const sections: MemorySection[] = []
  let current: MemorySection = { title: null, rows: [] }
  for (const raw of markdown.split(/\r?\n/)) {
    const heading = raw.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/)
    if (heading) {
      if (current.rows.length) sections.push(current)
      current = { title: plain(heading[1]) || null, rows: [] }
      continue
    }
    const text = plain(raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, ""))
    if (!text || /^[-*_]{3,}$/.test(text) || /:$/.test(text)) continue
    current.rows.push(text)
  }
  if (current.rows.length) sections.push(current)
  return sections
}

/** "Updated today", "Updated yesterday", "Updated 3 days ago", else "Updated 7 Nov". */
export function updatedLine(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000)
  if (days <= 0) return "Updated today"
  if (days === 1) return "Updated yesterday"
  if (days < 7) return `Updated ${days} days ago`
  return `Updated ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
}
