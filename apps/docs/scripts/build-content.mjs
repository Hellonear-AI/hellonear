// Turns content/**/*.md into lib/generated/pages.json, the one source every route reads (HTML, .md export, llms
// files, MCP), so nothing reads the file system at request time. Also copies the repo's OpenAPI spec into public/.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = join(root, 'content')

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : name.endsWith('.md') ? [path] : []
  })

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
  const slug = file.replace(/\.md$/, '').replace(/(^|\/)index$/, '')
  return { slug, title: meta.title, description: meta.description, markdown: text.slice(m[0].length).trim() + '\n' }
}

const pages = walk(contentDir)
  .map((path) => parsePage(relative(contentDir, path).split('\\').join('/'), readFileSync(path, 'utf8')))
  .sort((a, b) => a.slug.localeCompare(b.slug))

for (const p of pages) {
  if (/[\u2013\u2014]/.test(p.markdown + p.title + p.description)) throw new Error(`content/${p.slug || 'index'}.md: no en or em dashes`)
}

mkdirSync(join(root, 'lib/generated'), { recursive: true })
writeFileSync(join(root, 'lib/generated/pages.json'), JSON.stringify(pages, null, 1) + '\n')
// public/ holds only generated files, so it is not in git: make it on a fresh checkout.
mkdirSync(join(root, 'public'), { recursive: true })
copyFileSync(join(root, '../../docs/openapi.json'), join(root, 'public/openapi.json'))
// Swagger UI's prebuilt bundle, served as a static file: bundling swagger-ui-react with Turbopack breaks its
// OpenAPI resolver ("OpenApi3_1Element.refract is not a function"), so an opened operation never loads.
mkdirSync(join(root, 'public/swagger'), { recursive: true })
for (const file of ['swagger-ui-bundle.js', 'swagger-ui.css']) {
  copyFileSync(join(root, 'node_modules/swagger-ui-dist', file), join(root, 'public/swagger', file))
}
console.log(`content: ${pages.length} pages, openapi.json and Swagger UI copied`)
