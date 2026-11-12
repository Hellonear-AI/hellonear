import generated from './generated/pages.json'
import { NAV, TRUST_TABS } from './nav'
import { SITE_URL } from './site'

export type Page = { slug: string; title: string; description: string; markdown: string }

export const pages: Page[] = generated
const bySlug = new Map(pages.map((p) => [p.slug, p]))

/** A page by slug ('' is the introduction), or undefined. Accepts '/x', 'x.md' and 'x/'. */
export function getPage(path: string): Page | undefined {
  return bySlug.get(normalize(path))
}

export function normalize(path: string): string {
  let p = path.trim()
  try {
    if (/^https?:\/\//.test(p)) p = new URL(p).pathname
  } catch {}
  p = p.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '').replace(/\.md$/, '')
  if (p === 'index') return ''
  return p.replace(/\/index$/, '')
}

export const pageUrl = (slug: string) => `/${slug}`
export const markdownUrl = (slug: string) => (slug ? `/${slug}.md` : '/index.md')

/** The page as one Markdown document: what /<path>.md, llms-full.txt and MCP read_page return. */
export function pageMarkdown(p: Page): string {
  return `# ${p.title}\n\n> ${p.description}\n\n${p.markdown}`
}

/** Docs pages in sidebar order, then the trust pages. */
export function orderedSections(): { title: string; pages: Page[] }[] {
  const take = (slugs: string[]) => slugs.map((s) => bySlug.get(s)).filter((p): p is Page => !!p)
  return [...NAV.map((s) => ({ title: s.title, pages: take(s.slugs) })), { title: 'Trust', pages: take(TRUST_TABS.map((t) => t.slug)) }]
}

export function llmsTxt(base = SITE_URL): string {
  const intro = bySlug.get('')!
  const sections = orderedSections()
    .map((s) => `## ${s.title}\n\n${s.pages.map((p) => `- [${p.title}](${base}${markdownUrl(p.slug)}): ${p.description}`).join('\n')}`)
    .join('\n\n')
  return `# HelloNear\n\n> ${intro.description}\n\nEverything runs on NEAR testnet during NEAR HACKATHON (1 to 14 Nov 2026). Every page below is Markdown; the HTML version is the same path without \`.md\`. All pages in one file: ${base}/llms-full.txt. OpenAPI spec: ${base}/openapi.json. MCP server (search_docs, read_page): ${base}/mcp.\n\n${sections}\n`
}

export function llmsFullTxt(base = SITE_URL): string {
  return orderedSections()
    .flatMap((s) => s.pages)
    .map((p) => `${pageMarkdown(p)}\nSource: ${base}${pageUrl(p.slug)}\n`)
    .join('\n---\n\n')
}

export type Hit = { slug: string; title: string; url: string; description: string; snippet: string; score: number }

const words = (s: string) => s.toLowerCase().match(/[a-z0-9_.\-]+/g)?.filter((w) => w.length > 1) ?? []

/** Keyword search: title matches weigh most, then the description, then how often the words occur in the body. */
export function search(query: string, limit = 5, base = SITE_URL): Hit[] {
  const terms = [...new Set(words(query))]
  if (!terms.length) return []
  const hits: Hit[] = []
  for (const p of pages) {
    const title = p.title.toLowerCase()
    const desc = p.description.toLowerCase()
    const body = p.markdown.toLowerCase()
    let score = 0
    let matched = 0
    for (const t of terms) {
      const inBody = body.split(t).length - 1
      const s = (title.includes(t) ? 10 : 0) + (desc.includes(t) ? 4 : 0) + Math.min(inBody, 10)
      if (s > 0) matched++
      score += s
    }
    if (!score) continue
    score *= matched / terms.length
    if (title === query.toLowerCase().trim()) score += 20
    hits.push({ slug: p.slug, title: p.title, url: `${base}${pageUrl(p.slug)}`, description: p.description, snippet: snippet(p.markdown, terms), score: Math.round(score * 100) / 100 })
  }
  return hits.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug)).slice(0, Math.max(1, Math.min(limit, 20)))
}

function snippet(markdown: string, terms: string[]): string {
  const lines = markdown.split('\n').filter((l) => l.trim() && !l.startsWith('|---'))
  const line = lines.find((l) => terms.some((t) => l.toLowerCase().includes(t))) ?? lines[0] ?? ''
  const clean = line.replace(/[*`#>|]/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim()
  return clean.length > 240 ? clean.slice(0, 237) + '...' : clean
}

/** Splits Markdown at headings of one level: the text before the first one, then each section. */
export function sections(markdown: string, level: 2 | 3): { intro: string; items: { title: string; id: string; body: string }[] } {
  const mark = '#'.repeat(level) + ' '
  const parts = markdown.split('\n')
  let intro: string[] = []
  const items: { title: string; id: string; body: string }[] = []
  let inFence = false
  for (const line of parts) {
    if (line.startsWith('```')) inFence = !inFence
    if (!inFence && line.startsWith(mark)) {
      const title = line.slice(mark.length).trim()
      items.push({ title, id: slugify(title), body: '' })
    } else if (items.length) items[items.length - 1].body += line + '\n'
    else intro.push(line)
  }
  return { intro: intro.join('\n').trim(), items: items.map((i) => ({ ...i, body: i.body.trim() })) }
}

/** GitHub-style heading ids, so README anchors keep working. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
}
