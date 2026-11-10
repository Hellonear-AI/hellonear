// Offline unit tests for the Markdown → Telegram HTML converter (#221). Every output is also checked against the fake
// Telegram's reading of the "HTML style" rules (`telegramHtmlError`), which is what a real chat would refuse.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeMd, plainOf, telegramChunks, telegramHtml } from '../src/telegramFormat.ts'
import { telegramHtmlError } from './fake-telegram.ts'

const html = (md: string) => {
  const out = telegramHtml(md)
  assert.equal(telegramHtmlError(out), null, `invalid Telegram HTML: ${out}`)
  return out
}

test('bold, italic and strikethrough', () => {
  assert.equal(html('**bold** and __bold__'), '<b>bold</b> and <b>bold</b>')
  assert.equal(html('*italic* and _italic_'), '<i>italic</i> and <i>italic</i>')
  assert.equal(html('~~gone~~'), '<s>gone</s>')
  assert.equal(html('**bold with *italic* inside**'), '<b>bold with <i>italic</i> inside</b>')
  // Crossed marks never produce crossed tags.
  assert.equal(telegramHtmlError(html('**a *b** c*')), null)
  // Underscores inside words and lone stars stay as they are.
  assert.equal(html('snake_case_name and 2 * 3 * 4'), 'snake_case_name and 2 * 3 * 4')
  assert.equal(html('**unclosed bold'), '**unclosed bold')
})

test('inline code and fenced code, nothing inside is formatted', () => {
  assert.equal(html('run `npm i <pkg> && go`'), 'run <code>npm i &lt;pkg&gt; &amp;&amp; go</code>')
  assert.equal(html('`**not bold**`'), '<code>**not bold**</code>')
  assert.equal(html('```ts\nconst a = 1 < 2\n```'), '<pre><code class="language-ts">const a = 1 &lt; 2</code></pre>')
  assert.equal(html('```\nplain\n```'), '<pre>plain</pre>')
  // A code block holding HTML shows it as text.
  assert.equal(html('```html\n<b>hi</b> & <script>\n```'), '<pre><code class="language-html">&lt;b&gt;hi&lt;/b&gt; &amp; &lt;script&gt;</code></pre>')
  // An unclosed fence runs to the end and is still closed in the output.
  assert.equal(html('```\nnever closed'), '<pre>never closed</pre>')
})

test('links: http and https only, bare URLs too, & escaped in the href', () => {
  assert.equal(html('[NEAR docs](https://docs.near.org)'), '<a href="https://docs.near.org">NEAR docs</a> (docs.near.org)')
  assert.equal(html('see https://x.test/?a=1&b=2.'), 'see <a href="https://x.test/?a=1&amp;b=2">https://x.test/?a=1&amp;b=2</a>.')
  assert.equal(html('[q](https://x.test/?a=1&b="2")'), '<a href="https://x.test/?a=1&amp;b=&quot;2&quot;">q</a> (x.test)')
  assert.equal(html('[wiki](https://en.wikipedia.org/wiki/Rust_(language))'), '<a href="https://en.wikipedia.org/wiki/Rust_(language)">wiki</a> (en.wikipedia.org)')
  assert.equal(html('(https://a.test/x_y_z)'), '(<a href="https://a.test/x_y_z">https://a.test/x_y_z</a>)')
  // Any other scheme stays visible as text, never a link.
  assert.equal(html('[click](javascript:alert(1))'), 'click (javascript:alert(1))')
  assert.equal(html('[me](tg://user?id=1)'), 'me (tg://user?id=1)')
  // Formatting in link text; no link inside a link.
  assert.equal(html('[**bold** https://b.test](https://a.test)'), '<a href="https://a.test"><b>bold</b> https://b.test</a> (a.test)')
})

test('headings are bold lines; lists use • and numbers, nested bold in a list', () => {
  assert.equal(html('# Title\n### Sub **x**'), '<b>Title</b>\n<b>Sub x</b>')
  assert.equal(html('- one\n* two\n+ **three** and *four*'), '• one\n• two\n• <b>three</b> and <i>four</i>')
  assert.equal(html('1. first\n2) second'), '1. first\n2. second')
  assert.equal(html('- top\n  - nested'), '• top\n   • nested')
  assert.equal(html('- [ ] todo\n- [x] done'), '• ☐ todo\n• ☑ done')
})

test('blockquotes, tables as one line per row, rules dropped', () => {
  assert.equal(html('> quoted **bold**\n> second line'), '<blockquote>quoted <b>bold</b>\nsecond line</blockquote>')
  assert.equal(html('| Name | Amount |\n|---|---:|\n| shop | 0.1 NEAR |\n| cafe | `0.2` |'), '<b>Name | Amount</b>\nshop | 0.1 NEAR\ncafe | <code>0.2</code>')
  assert.equal(html('above\n\n---\n\nbelow'), 'above\n\nbelow')
})

test('everything else is escaped: <, >, &, quotes, and forged placeholders', () => {
  assert.equal(html('1 < 2 & 3 > 2 <b>not a tag</b> &amp;'), '1 &lt; 2 &amp; 3 &gt; 2 &lt;b&gt;not a tag&lt;/b&gt; &amp;amp;')
  assert.equal(html('say "hi"'), 'say "hi"')
  assert.equal(html('0 x'), '0 x')
  assert.equal(html('\\*not italic\\*'), '*not italic*')
  assert.equal(html(`code ${escapeMd('run_error')}`), 'code run_error')
})

test('paragraphs keep line breaks and blank lines between blocks', () => {
  assert.equal(html('line one\nline two\n\n\npara two'), 'line one\nline two\n\npara two')
  assert.equal(html('text\n```\ncode\n```\nmore'), 'text\n\n<pre>code</pre>\n\nmore')
  assert.equal(html(''), '')
})

test('a long reply splits into chunks of at most 4096, each valid on its own', () => {
  const para = (i: number) => `**Part ${i}** with a [link](https://x.test/?a=${i}&b=2) and \`code <${i}>\`. ` + 'word '.repeat(150)
  const md = Array.from({ length: 12 }, (_, i) => para(i)).join('\n\n') + '\n\n```js\n' + Array.from({ length: 400 }, (_, i) => `line(${i}) < & >`).join('\n') + '\n```\n\n> ' + 'quote '.repeat(900)
  const parts = telegramChunks(md)
  assert.ok(parts.length > 3, `only ${parts.length} chunks`)
  for (const p of parts) {
    assert.ok(p.length <= 4096, `chunk of ${p.length}`)
    assert.equal(telegramHtmlError(p), null, `invalid chunk: ${p.slice(0, 80)}…`)
  }
  // The code block was split into several <pre> blocks, each closed; no text was lost.
  assert.ok(parts.filter((p) => p.includes('<pre><code class="language-js">')).length >= 2)
  const plain = plainOf(parts.join('\n'))
  for (const i of [0, 11]) assert.ok(plain.includes(`Part ${i}`))
  assert.ok(plain.includes('line(0) < & >') && plain.includes('line(399) < & >'))
  // A single line longer than a message is cut too, never inside an entity.
  const one = telegramChunks('&'.repeat(5000))
  assert.ok(one.length === 7 && one.every((p) => telegramHtmlError(p) === null && p.length <= 4096))
  assert.equal(plainOf(one.join('')), '&'.repeat(5000))
  const code = telegramChunks('```\n' + '<'.repeat(9000) + '\n```')
  assert.ok(code.length >= 3 && code.every((p) => telegramHtmlError(p) === null && p.length <= 4096 && p.startsWith('<pre>')))
})

test('plainOf reads a chunk back as plain text, links as "text (url)"', () => {
  assert.equal(plainOf(telegramHtml('**Paid** [receipt](https://x.test/?a=1&b=2) & https://y.test')), 'Paid receipt (https://x.test/?a=1&b=2) & https://y.test')
})

test('a link label never hides the host it goes to (review on #223)', () => {
  const html = telegramHtml('[Your bank](http://evil.example/login)')
  assert.equal(html, '<a href="http://evil.example/login">Your bank</a> (evil.example)')
  assert.equal(telegramHtmlError(html), null)
  // A label that already names the host gets nothing more.
  assert.equal(telegramHtml('[docs.near.org](https://docs.near.org/x)'), '<a href="https://docs.near.org/x">docs.near.org</a>')
  assert.equal(telegramHtml('[NearBlocks testnet.nearblocks.io](https://www.testnet.nearblocks.io/txns/abc)'), '<a href="https://www.testnet.nearblocks.io/txns/abc">NearBlocks testnet.nearblocks.io</a>')
})
