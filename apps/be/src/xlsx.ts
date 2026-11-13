// A minimal .xlsx writer (one sheet), no dependencies. An .xlsx is a zip of a few XML files; the zip here is "stored"
// (no compression), which every spreadsheet app opens. Cells are typed, so a number stays a number and a date a date in
// any locale: the reason it exists is that a comma CSV opens in one column in Excel on a comma-decimal locale (Indonesia,
// most of Europe), and a `;` CSV breaks every other locale (#298).
import { crc32 } from 'node:zlib'

export type Cell = string | number | Date | { text: string; link: string } | null
export interface Sheet { name: string; header: string[]; rows: Cell[][]; widths?: number[] }

// XML 1.0 can't hold most control characters, even escaped; drop them. Tab, LF and CR stay.
const xml = (s: string) => s
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  .slice(0, 32767)

export function colName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

// Excel's date serial: days since 1899-12-30, in UTC (the sheet says "(UTC)" in its header).
const serial = (d: Date) => d.getTime() / 86_400_000 + 25_569

// Style ids in styles.xml below: 0 default, 1 bold header, 2 date-time, 3 hyperlink.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

function sheetXml(sheet: Sheet): { xml: string; links: string[] } {
  const links: string[] = []
  const refs: string[] = []
  const cell = (v: Cell, ref: string, header = false): string => {
    if (v === null || v === '') return ''
    if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : ''
    if (v instanceof Date) return `<c r="${ref}" s="2"><v>${serial(v)}</v></c>`
    if (typeof v === 'object') {
      links.push(v.link)
      refs.push(`<hyperlink ref="${ref}" r:id="rId${links.length}"/>`)
      return `<c r="${ref}" s="3" t="inlineStr"><is><t>${xml(v.text)}</t></is></c>`
    }
    // Inline strings are never formulas, so text like "=1+1" stays text without a leading quote.
    return `<c r="${ref}"${header ? ' s="1"' : ''} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`
  }
  const rows = [sheet.header, ...sheet.rows]
  const data = rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(v, `${colName(j)}${i + 1}`, i === 0)).join('')}</row>`).join('')
  const last = `${colName(sheet.header.length - 1)}${rows.length}`
  const cols = sheet.widths?.length ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  return {
    links,
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${cols}<sheetData>${data}</sheetData><autoFilter ref="A1:${last}"/>${refs.length ? `<hyperlinks>${refs.join('')}</hyperlinks>` : ''}
</worksheet>`,
  }
}

export function xlsx(sheet: Sheet): Buffer {
  const { xml: sheetBody, links } = sheetXml(sheet)
  const files: [string, string][] = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheet.name.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(sheet.name.slice(0, 31)).replace(/'/g, "''")}'!$A$1:$${colName(sheet.header.length - 1)}$${sheet.rows.length + 1}</definedName></definedNames></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', sheetBody],
  ]
  if (links.length) files.push(['xl/worksheets/_rels/sheet1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${links.map((l, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(l)}" TargetMode="External"/>`).join('')}</Relationships>`])
  return zip(files.map(([name, body]) => [name, Buffer.from(body, 'utf8')]))
}

// A stored (uncompressed) zip: local headers + data, then the central directory and its end record.
export function zip(entries: [string, Buffer][]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, data] of entries) {
    const n = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12) // 1980-01-01 00:00, a fixed time keeps the file reproducible
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(n.length, 26); local.writeUInt16LE(0, 28)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8); dir.writeUInt16LE(0, 10)
    dir.writeUInt16LE(0, 12); dir.writeUInt16LE(0x21, 14)
    dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(data.length, 24)
    dir.writeUInt16LE(n.length, 28); dir.writeUInt16LE(0, 30); dir.writeUInt16LE(0, 32); dir.writeUInt16LE(0, 34); dir.writeUInt16LE(0, 36)
    dir.writeUInt32LE(0, 38); dir.writeUInt32LE(offset, 42)
    parts.push(local, n, data)
    central.push(dir, n)
    offset += local.length + n.length + data.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, end])
}
