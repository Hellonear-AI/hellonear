import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPage, llmsFullTxt, llmsTxt, normalize, pageMarkdown, pages, search, sections, slugify } from '../lib/content'
import { render, renderMatrix } from '../lib/markdown'
import { NAV, TRUST_TABS } from '../lib/nav'
import { rewriteTarget, wantsMarkdown } from '../proxy'

test('every content page is in the nav or the trust tabs exactly once', () => {
  const listed = [...NAV.flatMap((s) => s.slugs), ...TRUST_TABS.map((t) => t.slug)]
  assert.equal(new Set(listed).size, listed.length, 'a slug is listed twice')
  assert.deepEqual([...listed].sort(), pages.map((p) => p.slug).sort())
})

test('pages load with title, description and body, and no en or em dashes', () => {
  assert.ok(pages.length >= 30)
  for (const p of pages) {
    assert.ok(p.title && p.description && p.markdown.trim(), p.slug)
    assert.doesNotMatch(p.markdown + p.title + p.description, /[–—]/, p.slug)
    assert.doesNotMatch(p.markdown, /<img|<picture/, `${p.slug}: README images must be stripped`)
  }
})

test('getPage accepts paths, .md suffixes and full URLs', () => {
  assert.equal(normalize('/quickstart.md'), 'quickstart')
  assert.equal(normalize('https://docs.hellonear.xyz/trust/faq#security'), 'trust/faq')
  assert.equal(normalize('/index.md'), '')
  assert.equal(getPage('/')?.title, 'Introduction')
  assert.equal(getPage('trust/subprocessors/')?.title, 'Subprocessors')
  assert.equal(getPage('nope'), undefined)
})

test('internal links point at pages that exist', () => {
  for (const p of pages) {
    for (const [, href] of p.markdown.matchAll(/\]\((\/[^)#\s]*)/g)) {
      if (href === '/openapi.json' || href === '/llms.txt' || href === '/llms-full.txt' || href === '/skill.md' || href === '/mcp') continue
      assert.ok(getPage(href), `${p.slug || 'index'} links to missing ${href}`)
    }
  }
})

test('llms.txt lists every page as a .md link; llms-full.txt has every page', () => {
  const txt = llmsTxt('https://x.test')
  assert.match(txt, /^# HelloNear\n\n> /)
  for (const p of pages) assert.ok(txt.includes(`https://x.test${p.slug ? `/${p.slug}.md` : '/index.md'}`), p.slug)
  const full = llmsFullTxt('https://x.test')
  for (const p of pages) assert.ok(full.includes(`# ${p.title}\n`), p.slug)
  assert.ok(pageMarkdown(getPage('quickstart')!).startsWith('# Quickstart\n\n> '))
})

test('search ranks the page about the words first', () => {
  assert.equal(search('daily limit freeze')[0]?.slug, 'wallet-and-approvals')
  assert.equal(search('subprocessors')[0]?.slug, 'trust/subprocessors')
  assert.equal(search('swarm auction clearing price')[0]?.slug, 'swarm-auction')
  assert.equal(search('run.verified')[0] !== undefined, true)
  assert.deepEqual(search('   '), [])
  assert.deepEqual(search('zzzqqq'), [])
  assert.equal(search('near', 3).length, 3)
  const hit = search('relayer')[0]
  assert.ok(hit.url.startsWith('https://docs.hellonear.xyz/') && hit.snippet.length > 0 && hit.snippet.length <= 240)
})

test('headings get GitHub-style ids so README anchors keep working', () => {
  assert.equal(slugify('The swarm auction: one real round on testnet'), 'the-swarm-auction-one-real-round-on-testnet')
  assert.equal(slugify("The registry contract's source is verified"), 'the-registry-contracts-source-is-verified')
  assert.match(render('## Hello, world'), /<h2 id="hello-world">/)
  assert.match(render('| a |\n|---|\n| b |'), /<div class="table-wrap"><table>/)
})

test('sections splits at one heading level and ignores code fences', () => {
  const s = sections('intro\n\n## A\none\n```\n## not a heading\n```\n## B\ntwo', 2)
  assert.equal(s.intro, 'intro')
  assert.deepEqual(s.items.map((i) => i.title), ['A', 'B'])
  assert.match(s.items[0].body, /not a heading/)
})

test('the trust matrix renders Yes as a linked check and N/A dimmed', () => {
  const html = renderMatrix('| Scope | X | Y |\n|---|---|---|\n| Chat | [Yes](https://e.test) | N/A |')
  assert.match(html, /class="cell-yes"><a href="https:\/\/e.test"[^>]*class="check"/)
  assert.match(html, /class="cell-na">N\/A</)
  const overview = getPage('trust')!.markdown
  assert.doesNotMatch(overview, /SOC ?2|ISO ?27001|audit/i)
})

test('proxy: .md, Accept: text/markdown and the trust host', () => {
  assert.equal(rewriteTarget('docs.hellonear.xyz', '/quickstart.md', null), '/md/quickstart')
  assert.equal(rewriteTarget('docs.hellonear.xyz', '/index.md', null), '/md')
  assert.equal(rewriteTarget('docs.hellonear.xyz', '/trust/faq.md', null), '/md/trust/faq')
  assert.equal(rewriteTarget('docs.hellonear.xyz', '/skill.md', null), null)
  assert.equal(rewriteTarget('docs.hellonear.xyz', '/quickstart', 'text/markdown'), '/md/quickstart')
  assert.equal(rewriteTarget('docs.hellonear.xyz', '/', 'text/markdown, text/html;q=0.5'), '/md')
  assert.equal(rewriteTarget('docs.hellonear.xyz', '/quickstart', 'text/html,application/xhtml+xml'), null)
  assert.equal(rewriteTarget('trust.hellonear.xyz', '/', null), '/trust')
  assert.equal(rewriteTarget('trust.hellonear.xyz', '/faq', null), '/trust/faq')
  assert.equal(rewriteTarget('trust.hellonear.xyz', '/faq.md', null), '/md/trust/faq')
  assert.equal(rewriteTarget('trust.hellonear.xyz', '/trust/faq', null), null)
  assert.equal(rewriteTarget('trust.hellonear.xyz', '/quickstart', null), null)
  assert.equal(wantsMarkdown('text/html, text/markdown'), false)
})
