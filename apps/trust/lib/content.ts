import generated from './generated/pages.json'
import { SITE_URL } from './site'
import { TABS } from './tabs'

export { TABS }

export type Page = { slug: string; title: string; description: string; markdown: string }

export const pages: Page[] = generated
const bySlug = new Map(pages.map((p) => [p.slug, p]))


/** A page by slug ('' is the Overview), or undefined. Accepts '/x', 'x.md' and 'x/'. */
export function getPage(path: string): Page | undefined {
  return bySlug.get(normalize(path))
}

export function normalize(path: string): string {
  let p = path.trim()
  try {
    if (/^https?:\/\//.test(p)) p = new URL(p).pathname
  } catch {}
  p = p.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '').replace(/\.md$/, '')
  return p === 'index' ? '' : p
}

export const pageUrl = (slug: string) => `/${slug}`
export const markdownUrl = (slug: string) => (slug ? `/${slug}.md` : '/index.md')

/** The page as one Markdown document: what /<path>.md returns. */
export function pageMarkdown(p: Page): string {
  return `# ${p.title}\n\n> ${p.description}\n\n${p.markdown}`
}

export function llmsTxt(base = SITE_URL): string {
  const list = TABS.map((t) => bySlug.get(t.slug)!)
    .map((p) => `- [${p.title}](${base}${markdownUrl(p.slug)}): ${p.description}`)
    .join('\n')
  return `# HelloNear Trust Center\n\n> ${bySlug.get('')!.description}\n\nEverything runs on NEAR testnet during NEAR HACKATHON (1 to 14 Nov 2026). Every page below is Markdown; the HTML version is the same path without \`.md\`. The product docs are at https://docs.hellonear.xyz.\n\n## Pages\n\n${list}\n`
}

/** Splits Markdown at headings of one level: the text before the first one, then each section. */
export function sections(markdown: string, level: 2 | 3): { intro: string; items: { title: string; id: string; body: string }[] } {
  const mark = '#'.repeat(level) + ' '
  const intro: string[] = []
  const items: { title: string; id: string; body: string }[] = []
  let inFence = false
  for (const line of markdown.split('\n')) {
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
