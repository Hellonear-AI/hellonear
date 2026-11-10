// Markdown → Telegram HTML (#221). The Mind writes light Markdown, which the app renders; Telegram renders its own small
// HTML set when a message has parse_mode "HTML" (core.telegram.org/bots/api, "HTML style", read 11 Nov 2026): <b> <i>
// <u> <s> <a href> <code> <pre> (<pre><code class="language-x">) <blockquote>. Every <, > and & that is not ours must be
// escaped, and the only named entities are &lt; &gt; &amp; &quot;. So all text is escaped first and only the tags below
// are ever written; links only for http/https. No Markdown library: the Mind's subset is small, and an unknown construct
// simply stays as escaped text.
// A message holds at most 4096 characters, and each one is parsed on its own, so a long reply is split between blocks
// (or lines of a block), never inside a tag: every chunk is valid HTML by itself.

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// Our own words put into Markdown that must stay literal (an error code with underscores).
export const escapeMd = (s: string) => s.replace(/[\\`*_~[\]()#>|!-]/g, '\\$&')
const escapeAttr =(s: string) => escapeHtml(s).replace(/"/g, '&quot;')

// Placeholders for finished HTML (code spans, links) while emphasis runs over the rest. Private-use characters, removed
// from the input first, so no text can forge one.
const PH = /(\d+)/g
const stripPh = (s: string) => s.replace(/[]/g, '')

// A bare URL ends before whitespace, <, > or a quote; trailing punctuation is the sentence's, not the URL's (a closing
// parenthesis stays when the URL opened one, as in Wikipedia links).
const BARE_URL = /https?:\/\/[^\s<>"'`]+/g
function trimUrl(u: string) {
  while (/[.,;:!?*_~]$/.test(u) || (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0))) u = u.slice(0, -1)
  return u
}
const isWebUrl = (u: string) => /^https?:\/\/[^\s]+$/i.test(u)

// Emphasis on text that is already escaped (the markers survive escaping). The earliest match wins, ties go to the
// longer marker; the inside is converted on its own, so tags always nest and close: **a *b** c* cannot cross.
const EMPHASIS: [RegExp, string][] = [
  [/\*\*(?=\S)([^\n]*?\S)\*\*/, 'b'],
  [/(?<![\p{L}\p{N}_])__(?=\S)([^\n]*?\S)__(?![\p{L}\p{N}_])/u, 'b'],
  [/~~(?=\S)([^\n]*?\S)~~/, 's'],
  [/(?<![*\p{L}\p{N}])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*\p{L}\p{N}])/u, 'i'],
  [/(?<![\p{L}\p{N}_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\p{L}\p{N}_])/u, 'i'],
]
function emphasis(s: string): string {
  let best: { m: RegExpExecArray; tag: string } | null = null
  for (const [re, tag] of EMPHASIS) {
    const m = re.exec(s)
    if (m && (!best || m.index < best.m.index)) best = { m, tag }
  }
  if (!best) return s
  const { m, tag } = best
  return s.slice(0, m.index) + `<${tag}>${emphasis(m[1])}</${tag}>` + emphasis(s.slice(m.index + m[0].length))
}

// One line of inline Markdown: code spans, links, bare URLs, then emphasis on the escaped rest.
function inline(src: string, links = true): string {
  const parts: string[] = []
  const hold = (html: string) => `${parts.push(html) - 1}`
  let s = src
  // Code first: nothing inside a code span is Markdown.
  s = s.replace(/(`+)([^`\n]+?)\1(?!`)/g, (_, _ticks, code: string) => hold(`<code>${escapeHtml(code.trim() || code)}</code>`))
  // A backslash keeps the next mark literal (\* stays a star).
  s = s.replace(/\\([\\`*_~[\]()#>|!-])/g, (_, c: string) => hold(escapeHtml(c)))
  // A label never hides where a link goes (Lin1er on #223: [Your bank](http://evil.example/login)): the host follows it
  // unless the label already names it.
  const hostNote = (text: string, url: string) => {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return text.toLowerCase().includes(host.toLowerCase()) ? '' : ` (${escapeHtml(host)})`
  }
  if (links) {
    // [text](url), one level of parentheses inside the URL. Only http/https become links; any other scheme (javascript:,
    // tg:, mailto:) stays visible as text, so nothing is hidden behind a label.
    s = s.replace(/\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, text: string, url: string) =>
      isWebUrl(url) ? hold(`<a href="${escapeAttr(url)}">${inline(text, false)}</a>${hostNote(text, url)}`) : hold(`${inline(text, false)} (${escapeHtml(url)})`))
    s = s.replace(BARE_URL, (raw: string) => {
      const url = trimUrl(raw)
      return hold(`<a href="${escapeAttr(url)}">${escapeHtml(url)}</a>`) + escapeHtml(raw.slice(url.length))
    })
  }
  let html = emphasis(escapeHtml(s))
  // Placeholders can hold placeholders (a code span inside link text): restore until none are left.
  while (html.includes('')) html = html.replace(PH, (_, i: string) => parts[Number(i)])
  return html
}

// A line outside code: heading → bold line, list item → "•" or "1.", else inline text. Indent shows nesting.
function line(src: string): string {
  const heading = src.match(/^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/)
  // Bold inside a bold heading would nest <b> in <b>; the whole line is bold anyway.
  if (heading) return heading[1] ? `<b>${inline(heading[1]).replace(/<\/?b>/g, '')}</b>` : ''
  const item = src.match(/^(\s*)(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/)
  if (item) {
    const depth = Math.min(Math.floor(item[1].replace(/\t/g, '  ').length / 2), 4)
    const task = item[4].match(/^\[([ xX])\]\s+(.*)$/)
    const body = task ? `${task[1] === ' ' ? '☐' : '☑'} ${inline(task[2])}` : inline(item[4])
    return `${'   '.repeat(depth)}${item[2] ? '•' : `${item[3]}.`} ${body}`
  }
  return inline(src.trim())
}

// A table row "| a | b |" as one line: cells joined by " | ", the header row bold.
const cellsOf = (row: string) => row.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map((c) => c.trim())
const isTableRule = (row: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(row)
const isTableRow = (row: string) => /^\s*\|.*\|\s*$/.test(row)

// A block is self-contained HTML: `open` + its lines joined by "\n" + `close`. Lines are kept apart so a block too long
// for one message can be split between lines, each part wrapped again.
type Block = { open: string; close: string; lines: string[]; code: boolean }

export function telegramBlocks(markdown: string): Block[] {
  const src = stripPh(markdown).replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => { if (para.length) blocks.push({ open: '', close: '', lines: para, code: false }); para = [] }
  for (let i = 0; i < src.length; i++) {
    const l = src[i]
    const fence = l.match(/^\s{0,3}(`{3,}|~{3,})\s*([\w#+.-]*)/)
    if (fence) {
      flush()
      const body: string[] = []
      for (i++; i < src.length && !new RegExp(`^\\s{0,3}${fence[1][0]}{${fence[1].length},}\\s*$`).test(src[i]); i++) body.push(escapeHtml(src[i]))
      const lang = fence[2]
      blocks.push({ open: lang ? `<pre><code class="language-${escapeAttr(lang)}">` : '<pre>', close: lang ? '</code></pre>' : '</pre>', lines: body.length ? body : [''], code: true })
      continue
    }
    if (!l.trim()) { flush(); continue }
    if (/^\s{0,3}>/.test(l)) {
      flush()
      const body: string[] = []
      for (; i < src.length && /^\s{0,3}>/.test(src[i]); i++) body.push(line(src[i].replace(/^\s{0,3}>\s?/, '')))
      i--
      blocks.push({ open: '<blockquote>', close: '</blockquote>', lines: body, code: false })
      continue
    }
    if (isTableRow(l) && i + 1 < src.length && isTableRule(src[i + 1])) {
      flush()
      const rows = [`<b>${cellsOf(l).map((c) => inline(c).replace(/<\/?b>/g, '')).join(' | ')}</b>`]
      for (i += 2; i < src.length && isTableRow(src[i]); i++) rows.push(cellsOf(src[i]).map((c) => inline(c)).join(' | '))
      i--
      blocks.push({ open: '', close: '', lines: rows, code: false })
      continue
    }
    // A rule (---, ***, ___) only separates; Telegram has none.
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); continue }
    para.push(line(l))
  }
  flush()
  return blocks
}

// Telegram HTML for a whole reply, in one string (tests, and callers that know it is short).
export const telegramHtml = (markdown: string) => telegramBlocks(markdown).map(render).join('\n\n')
const render = (b: Block) => b.open + b.lines.join('\n') + b.close

// Cuts one over-long line into pieces that fit. A code line is escaped text: cut anywhere but inside an entity or a
// surrogate pair. An inline line holds tags: cut its visible text back out of the tags at spaces instead, then re-render
// each piece as plain escaped text with no markup (rare: a single line over ~4000 characters).
function cutLine(html: string, room: number, code: boolean): string[] {
  const text = code ? html : html.replace(/<[^>]+>/g, '')
  const out: string[] = []
  let rest = text
  while (rest.length > room) {
    let at = room
    if (!code) { const sp = rest.lastIndexOf(' ', room); if (sp > room * 0.5) at = sp }
    const amp = rest.lastIndexOf('&', at)
    if (amp >= 0 && amp > at - 8 && rest.indexOf(';', amp) >= at) at = amp
    if (at > 0 && /[\uD800-\uDBFF]/.test(rest[at - 1])) at--
    out.push(rest.slice(0, at))
    rest = code ? rest.slice(at) : rest.slice(at).trimStart()
  }
  if (rest) out.push(rest)
  return out
}

// The reply as messages of at most `max` characters, each valid on its own. Blocks are packed whole, two newlines apart;
// a block too long for a message is split between its lines (each part keeps the block's tags), and a line too long
// for one is cut.
export function telegramChunks(markdown: string, max = 4096): string[] {
  const parts: string[] = []
  for (const b of telegramBlocks(markdown)) {
    const whole = render(b)
    if (whole.length <= max) { parts.push(whole); continue }
    const room = max - b.open.length - b.close.length
    let cur: string[] = []
    let len = 0
    const done = () => { if (cur.length) parts.push(b.open + cur.join('\n') + b.close); cur = []; len = 0 }
    for (const l of b.lines.flatMap((l) => (l.length > room ? cutLine(l, room, b.code) : [l]))) {
      if (cur.length && len + 1 + l.length > room) done()
      len += (cur.length ? 1 : 0) + l.length
      cur.push(l)
    }
    done()
  }
  const out: string[] = []
  let cur = ''
  for (const p of parts) {
    if (cur && cur.length + 2 + p.length > max) { out.push(cur); cur = '' }
    cur = cur ? `${cur}\n\n${p}` : p
  }
  if (cur.trim()) out.push(cur)
  return out
}

// The same chunk as plain text, for when Telegram refuses the HTML ("can't parse entities"): tags dropped, a link
// written as "text (url)", entities read back.
export function plainOf(html: string): string {
  return html
    // A link reads "text (url)". The host note after a labelled link (hostNote) is dropped: the whole URL shows already.
    .replace(/<a href="([^"]*)">([\s\S]*?)<\/a>(?: \(([^)<]+)\))?/g, (_, href: string, text: string, note?: string) => {
      const t = text.replace(/<[^>]+>/g, '')
      const url = href.replace(/&quot;/g, '"')
      const host = new URL(url.replace(/&amp;/g, '&')).hostname.replace(/^www\./, '')
      const rest = note !== undefined && note !== host ? ` (${note})` : ''
      return (t === url ? t : `${t} (${url})`) + rest
    })
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

// Telegram's answer when the HTML does not parse: 400 "Bad Request: can't parse entities: …".
export const cantParse = (description: string | undefined) => /can't parse entities/i.test(description ?? '')
