import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TABS, getPage, llmsTxt, normalize, pageMarkdown, pages, sections, slugify } from '../lib/content'
import { render, renderMatrix } from '../lib/markdown'
import { rewriteTarget, wantsMarkdown } from '../proxy'

test('every content page is a tab exactly once', () => {
  const listed = TABS.map((t) => t.slug)
  assert.equal(new Set(listed).size, listed.length, 'a tab is listed twice')
  assert.deepEqual([...listed].sort(), pages.map((p) => p.slug).sort())
})

test('pages load with title, description and body, and no en or em dashes or emoji', () => {
  assert.equal(pages.length, 5)
  for (const p of pages) {
    assert.ok(p.title && p.description && p.markdown.trim(), p.slug)
    assert.doesNotMatch(p.markdown + p.title + p.description, /[–—]/, p.slug)
    assert.doesNotMatch(p.markdown, /\p{Extended_Pictographic}/u, `${p.slug}: no emoji`)
  }
})

test('no compliance badges and no audit claim anywhere', () => {
  for (const p of pages) assert.doesNotMatch(p.markdown, /SOC ?2|ISO ?27001|ISO ?42001|HIPAA|\baudited\b/i, p.slug)
})

test('links are absolute or point at a trust page; none point at old docs-relative paths', () => {
  const tabs = new Set(TABS.map((t) => t.slug))
  for (const p of pages) {
    for (const [, href] of p.markdown.matchAll(/\]\(([^)\s]+)/g)) {
      if (/^https?:\/\//.test(href) || href.startsWith('#')) continue
      assert.ok(tabs.has(normalize(href)), `${p.slug || 'index'} links to ${href}, not a trust page or a full URL`)
    }
  }
})

test('every Yes in the scope table links to its proof', () => {
  const scope = sections(getPage('')!.markdown, 2).items.find((s) => s.title === 'Scope and controls')!
  const yes = [...scope.body.matchAll(/\|\s*(\[Yes\]\([^)]+\)|Yes)\s*(?=\|)/g)].map((m) => m[1])
  assert.ok(yes.length > 0)
  for (const y of yes) assert.match(y, /^\[Yes\]\(https?:\/\//, `unlinked Yes: ${y}`)
})

test('getPage accepts paths, .md suffixes and full URLs', () => {
  assert.equal(normalize('/faq.md'), 'faq')
  assert.equal(normalize('https://trust.hellonear.xyz/faq#security'), 'faq')
  assert.equal(normalize('/index.md'), '')
  assert.equal(getPage('/')?.title, 'Trust Center')
  assert.equal(getPage('subprocessors/')?.title, 'Subprocessors')
  assert.equal(getPage('nope'), undefined)
})

test('llms.txt lists every page as a .md link', () => {
  const txt = llmsTxt('https://x.test')
  assert.match(txt, /^# HelloNear Trust Center\n\n> /)
  for (const p of pages) assert.ok(txt.includes(`https://x.test${p.slug ? `/${p.slug}.md` : '/index.md'}`), p.slug)
  assert.ok(pageMarkdown(getPage('faq')!).startsWith('# FAQ\n\n> '))
})

test('headings get GitHub-style ids; sections split at one level and ignore code fences', () => {
  assert.equal(slugify("The registry contract's source is verified"), 'the-registry-contracts-source-is-verified')
  assert.match(render('## Hello, world'), /<h2 id="hello-world">/)
  const s = sections('intro\n\n## A\none\n```\n## not a heading\n```\n## B\ntwo', 2)
  assert.equal(s.intro, 'intro')
  assert.deepEqual(s.items.map((i) => i.title), ['A', 'B'])
})

test('the scope table renders Yes as a linked check and N/A dimmed', () => {
  const html = renderMatrix('| Scope | X | Y |\n|---|---|---|\n| Chat | [Yes](https://e.test) | N/A |')
  assert.match(html, /class="cell-yes"><a href="https:\/\/e.test"[^>]*class="check"/)
  assert.match(html, /class="cell-na">N\/A</)
})

test('proxy: .md and Accept: text/markdown read /md', () => {
  assert.equal(rewriteTarget('/faq.md', null), '/md/faq')
  assert.equal(rewriteTarget('/index.md', null), '/md')
  assert.equal(rewriteTarget('/', 'text/markdown'), '/md')
  assert.equal(rewriteTarget('/updates', 'text/markdown, text/html;q=0.5'), '/md/updates')
  assert.equal(rewriteTarget('/updates', 'text/html,application/xhtml+xml'), null)
  assert.equal(rewriteTarget('/faq', null), null)
  assert.equal(wantsMarkdown('text/html, text/markdown'), false)
})
