// Turns content/*.md into lib/generated/pages.json, the one source every route reads (HTML, .md export, llms.txt),
// so nothing reads the file system at request time.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = join(root, 'content')

export function parsePage(file, text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!m) throw new Error(`${file}: missing frontmatter`)
  const meta = Object.fromEntries(
    m[1].split('\n').filter(Boolean).map((line) => {
      const i = line.indexOf(':')
      if (i < 0) throw new Error(`${file}: bad frontmatter line "${line}"`)
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    }),
  )
  if (!meta.title || !meta.description) throw new Error(`${file}: title and description are required`)
  const slug = file.replace(/\.md$/, '').replace(/^index$/, '')
  return { slug, title: meta.title, description: meta.description, markdown: text.slice(m[0].length).trim() + '\n' }
}

const pages = readdirSync(contentDir)
  .filter((name) => name.endsWith('.md'))
  .map((name) => parsePage(name, readFileSync(join(contentDir, name), 'utf8')))
  .sort((a, b) => a.slug.localeCompare(b.slug))

for (const p of pages) {
  if (/[–—]/.test(p.markdown + p.title + p.description)) throw new Error(`content/${p.slug || 'index'}.md: no en or em dashes`)
}

// lib/generated/ is gitignored: make it on a fresh checkout.
mkdirSync(join(root, 'lib/generated'), { recursive: true })
writeFileSync(join(root, 'lib/generated/pages.json'), JSON.stringify(pages, null, 1) + '\n')
console.log(`content: ${pages.length} pages`)
