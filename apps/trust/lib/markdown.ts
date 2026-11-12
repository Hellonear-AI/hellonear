import { Marked } from 'marked'
import { slugify } from './content'

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth, text }) {
      const id = slugify(text)
      const inner = this.parser.parseInline(tokens)
      return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${depth}>\n`
    },
    link({ href, title, tokens }) {
      const inner = this.parser.parseInline(tokens)
      const external = /^https?:\/\//.test(href)
      const t = title ? ` title="${title}"` : ''
      return external ? `<a href="${href}"${t} rel="noopener noreferrer">${inner}</a>` : `<a href="${href}"${t}>${inner}</a>`
    },
  },
})

/** Markdown from content/ (ours, trusted) to HTML. */
export function render(markdown: string): string {
  const html = marked.parse(markdown, { async: false }) as string
  // Wide tables scroll inside their own box, never the page.
  return html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>')
}

/** The trust overview's scope table: "Yes" cells become a check mark, "N/A" cells are dimmed. */
export function renderMatrix(markdown: string): string {
  return render(markdown)
    .replace(/<td([^>]*)><a href="([^"]+)"([^>]*)>Yes<\/a><\/td>/g, '<td$1 class="cell-yes"><a href="$2"$3 class="check" aria-label="Yes, see the proof"><span aria-hidden="true">✓</span> Yes</a></td>')
    .replace(/<td([^>]*)>Yes<\/td>/g, '<td$1 class="cell-yes"><span class="check"><span aria-hidden="true">✓</span> Yes</span></td>')
    .replace(/<td([^>]*)>N\/A<\/td>/g, '<td$1 class="cell-na">N/A</td>')
}
