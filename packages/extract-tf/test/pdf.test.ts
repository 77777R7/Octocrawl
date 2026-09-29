import { afterEach, describe, expect, it, vi } from 'vitest'
import { pdfPagesForSpan, pdfToMarkdown } from '../src/index.js'
import type { PdfText, PdfToMarkdownResult } from '../src/index.js'
import { joinHyphenated } from '../src/pdf/assemble.js'

// A minimal PDF writer: one Courier font (every glyph is 0.6 em wide, so a
// run of n characters at size s is 0.6·n·s wide), text runs placed with Td or,
// when turned by some degrees, with Tm, optional vector drawing, an Info
// dictionary and an unopenable Encrypt entry.
type Run = [x: number, y: number, text: string, size?: number, degrees?: number]
interface FixturePage { runs?: Run[]; draw?: string }

function writePdf(pages: FixturePage[], options: { info?: Record<string, string>; encrypt?: boolean } = {}): Uint8Array {
  const literal = (text: string) => `(${text.replace(/[\\()]/g, '\\$&')})`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
  ]
  const kids = pages.map((page) => {
    const turn = (degrees: number) => {
      const [cos, sin] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)].map((n) => n.toFixed(6))
      return `${cos} ${sin} ${sin!.startsWith('-') ? sin!.slice(1) : `-${sin}`} ${cos}`
    }
    const content = [
      ...(page.runs ?? []).map(([x, y, text, size = 10, degrees]) => degrees === undefined
        ? `BT /F1 ${size} Tf ${x} ${y} Td ${literal(text)} Tj ET`
        : `BT /F1 ${size} Tf ${turn(degrees)} ${x} ${y} Tm ${literal(text)} Tj ET`),
      page.draw ?? '',
    ].join('\n')
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length} 0 R >>`)
    return objects.length
  })
  objects[1] = `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(' ')}] /Count ${kids.length} >>`
  let trailer = '/Root 1 0 R'
  if (options.info) {
    objects.push(`<< ${Object.entries(options.info).map(([key, value]) => `/${key} ${literal(value)}`).join(' ')} >>`)
    trailer += ` /Info ${objects.length} 0 R`
  }
  if (options.encrypt) {
    // A user password is required: no empty password matches /U, so the file cannot be opened.
    objects.push(`<< /Filter /Standard /V 1 /R 2 /O <${'ab'.repeat(32)}> /U <${'cd'.repeat(32)}> /P -44 >>`)
    trailer += ` /Encrypt ${objects.length} 0 R /ID [<${'01'.repeat(16)}> <${'01'.repeat(16)}>]`
  }
  let out = '%PDF-1.4\n'
  const offsets = objects.map((body, index) => {
    const at = out.length
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
    return at
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(out, (char) => char.charCodeAt(0))
}

/** Lines of prose, 12 pt apart, starting at (x, y). */
const lines = (x: number, y: number, texts: string[], size = 10): Run[] => texts.map((text, i) => [x, y - 12 * i, text, size])

function ok(result: PdfToMarkdownResult): PdfText {
  if (!result.ok) throw new Error(`expected text, got ${result.error.code}: ${result.error.message}`)
  return result
}

const LEFT = ['Capacity in Sydney reached 120 MW at', 'the end of the year, up from the 96 MW', 'reported a year earlier by the operator', 'in its annual data summary for owners.']
const RIGHT = ['Johor added a second campus of 80 MW', 'which the operator expects to double', 'by 2027 once the grid connection opens', 'and the cooling plant is commissioned.']

describe('pdfToMarkdown', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('marks each page in the Markdown and gives the offsets of its text', async () => {
    const pdf = writePdf([
      { runs: lines(72, 720, ['First page, line one', 'First page, line two']) },
      { runs: lines(72, 720, ['Second page']) },
      { runs: lines(72, 720, ['Third page']) },
    ])
    const out = ok(await pdfToMarkdown(pdf))
    expect(out.markdown).toBe([
      '<!-- page 1 -->', '', 'First page, line one', 'First page, line two', '',
      '<!-- page 2 -->', '', 'Second page', '',
      '<!-- page 3 -->', '', 'Third page', '',
    ].join('\n'))
    expect(out.pages.map(({ number, text, label }) => ({ number, text, label }))).toEqual([
      { number: 1, text: 'First page, line one\nFirst page, line two', label: null },
      { number: 2, text: 'Second page', label: null },
      { number: 3, text: 'Third page', label: null },
    ])
    for (const page of out.pages) expect(out.markdown.slice(page.start, page.end)).toBe(page.text)
    const at = out.markdown.indexOf('line two')
    expect(pdfPagesForSpan(out.pages, at, at + 8)).toEqual([1])
    expect(pdfPagesForSpan(out.pages, at, out.markdown.indexOf('Third') + 1)).toEqual([1, 2, 3])
    expect(pdfPagesForSpan(out.pages, 0, 5)).toEqual([])
    expect(out.info.pageCount).toBe(3)
    expect(out.warnings.map((w) => w.code)).toEqual(['tables_unverified'])
  })

  it('builds lines from placed words: spaces from gaps, none inside kerned words or before a subscript', async () => {
    const out = ok(await pdfToMarkdown(writePdf([{ runs: [
      // Line 1: 3 pt gaps between words (0.3 em) are spaces; "12" and "%" touch.
      [72, 700, 'Revenue'], [117, 700, 'grew'], [144, 700, '12'], [156, 700, '%'], [165, 700, 'in'], [180, 700, '2024'],
      // Line 2: a 0.5 pt kerning gap inside a word; a subscript 2 set lower and smaller.
      [72, 688, 'Envi'], [96.5, 688, 'ronment:'], [147.5, 688, 'CO'], [159.5, 685.5, '2', 6], [166, 688, 'fell'],
      // The same word drawn twice at nearly the same place (simulated bold) is one word.
      [72, 676, 'Total'], [72.3, 676, 'Total'], [150, 676, '404 Mt'],
      // Text drawn over other text is not glued to it.
      [72, 664, 'Emissions'], [100, 664, 'Scope 2'],
    ] }])))
    expect(out.pages[0]!.text).toBe('Revenue grew 12% in 2024\nEnvironment: CO2 fell\nTotal 404 Mt\nEmissions Scope 2')
  })

  it('starts a paragraph at a vertical gap or a change of size, not at each line', async () => {
    const out = ok(await pdfToMarkdown(writePdf([{ runs: [
      [72, 740, 'Key findings', 16],
      ...lines(72, 710, ['Electricity use by data centres', 'doubled between 2019 and 2024.']),
      ...lines(72, 660, ['Cooling accounts for a third', 'of the total.']),
    ] }])))
    expect(out.pages[0]!.text).toBe('Key findings\n\nElectricity use by data centres\ndoubled between 2019 and 2024.\n\nCooling accounts for a third\nof the total.')
  })

  it('reads two columns one after the other, below a title that spans both', async () => {
    const out = ok(await pdfToMarkdown(writePdf([{ runs: [
      [72, 740, 'Data centre capacity in Asia Pacific, 2025', 14],
      // Both columns share baselines, so every row of the page holds a line of each.
      ...lines(72, 700, LEFT),
      ...lines(324, 700, RIGHT),
      [300, 60, '7'],
    ] }])))
    expect(out.pages[0]!.text).toBe(['Data centre capacity in Asia Pacific, 2025', LEFT.join('\n'), RIGHT.join('\n'), '7'].join('\n\n'))
  })

  it('keeps the rows of a table as lines instead of reading it column by column', async () => {
    const out = ok(await pdfToMarkdown(writePdf([{ runs: [
      [72, 700, 'Site'], [300, 700, '2023'], [400, 700, '2024'],
      [72, 686, 'Sydney'], [306, 686, '96'], [400, 686, '120'],
      [72, 672, 'Johor'], [306, 672, '40'], [406, 672, '80'],
    ] }])))
    expect(out.pages[0]!.text).toBe('Site 2023 2024\nSydney 96 120\nJohor 40 80')
    expect(out.warnings).toContainEqual(expect.objectContaining({ code: 'tables_unverified' }))
  })

  it('keeps text in another direction out of the lines it crosses', async () => {
    const out = ok(await pdfToMarkdown(writePdf([{
      runs: [...lines(100, 700, ['Figure 3 shows capacity by region', 'for each of the last five years.']), [80, 640, 'Megawatts', 10, 90]],
    }])))
    expect(out.pages[0]!.text).toBe('Figure 3 shows capacity by region\nfor each of the last five years.\n\nMegawatts')
  })

  it('reads lines skewed by a degree or so, as in the text layer of a scan, in page order', async () => {
    const out = ok(await pdfToMarkdown(writePdf([{ runs: [
      [72, 700, 'The survey covered 412 sites', 10, 0.4],
      [72, 688, 'in 23 countries during 2024', 10, 1.3],
      [72, 676, 'and was repeated in 2025.', 10, 0.6],
    ] }])))
    expect(out.pages[0]!.text).toBe('The survey covered 412 sites\nin 23 countries during 2024\nand was repeated in 2025.')
  })

  it('gives a page without a text layer no text and a no_text_layer warning', async () => {
    const out = ok(await pdfToMarkdown(writePdf([
      { runs: lines(72, 720, ['Scanned appendix follows']) },
      { draw: '0.5 g 72 72 468 648 re f' },
      { runs: lines(72, 720, ['End of report']) },
    ])))
    expect(out.pages[1]).toMatchObject({ number: 2, text: '' })
    expect(out.pages[1]!.start).toBe(out.pages[1]!.end)
    expect(out.markdown).toContain('<!-- page 2 -->\n\n<!-- page 3 -->')
    expect(out.warnings.filter((w) => w.code === 'no_text_layer')).toEqual([expect.objectContaining({ page: 2 })])
  })

  it('removes a line-end hyphen only where the document itself shows the word unbroken', async () => {
    const out = ok(await pdfToMarkdown(writePdf([
      { runs: lines(72, 720, [
        'The economic case is clear. Its eco-',
        'nomic effect on long-',
        'term planning and on multi-',
        'lateral lenders spans 2020-',
        '2025 and a long-term view.',
      ]) },
      { runs: lines(72, 720, ['Growth continued in the second half, as', 'the report on page one shows: a sustain-']) },
      { runs: lines(72, 720, ['able pace.']) },
    ])))
    expect(out.pages[0]!.text).toBe([
      'The economic case is clear. Its economic',
      'effect on long-term',
      'planning and on multi-lateral',
      'lenders spans 2020-2025',
      'and a long-term view.',
    ].join('\n'))
    // Never across a page boundary: each page keeps its own words.
    expect(out.pages[1]!.text.endsWith('a sustain-')).toBe(true)
    expect(out.pages[2]!.text).toBe('able pace.')
    // A soft hyphen (U+00AD) marks a hyphenation point, so it always goes.
    expect(joinHyphenated(['Infra\u00ad', 'structure spending rose.'], new Map())).toEqual(['Infrastructure', 'spending rose.'])
    // Only a word continues across the line break, not a bullet or a symbol.
    expect(joinHyphenated(['Range 10-', '• 20 sites'], new Map())).toEqual(['Range 10-', '• 20 sites'])
  })

  it('keeps running headers and footers by default and removes them only on request, recoverably', async () => {
    const sites = ['Sydney', 'Johor', 'Tokyo', 'Osaka']
    const pages = sites.map((site, i) => ({ runs: [
      [72, 760, 'Annual Report 2024'] as Run,
      ...lines(72, 700, [`${site} reached ${40 + 10 * i} MW of capacity.`]),
      [300, 40, `Page ${i + 1}`] as Run,
    ] }))
    const kept = ok(await pdfToMarkdown(writePdf(pages)))
    expect(kept.pages[1]!.text).toBe('Annual Report 2024\n\nJohor reached 50 MW of capacity.\n\nPage 2')
    expect(kept.warnings.map((w) => w.code)).not.toContain('repeated_lines_removed')

    const removed = ok(await pdfToMarkdown(writePdf(pages), { repeatedLines: 'remove' }))
    expect(removed.pages.map((page) => page.text)).toEqual(sites.map((site, i) => `${site} reached ${40 + 10 * i} MW of capacity.`))
    expect(removed.pages[1]!.removedLines).toEqual(['Annual Report 2024', 'Page 2'])
    expect(removed.markdown).not.toContain('Annual Report')
    expect(removed.warnings).toContainEqual(expect.objectContaining({ code: 'repeated_lines_removed' }))
  })

  it('escapes page text that would read as a page marker', async () => {
    const out = ok(await pdfToMarkdown(writePdf([{ runs: lines(72, 720, ['<!-- page 9 -->', 'Real text']) }])))
    expect(out.pages[0]!.text).toBe('\\<!-- page 9 -->\nReal text')
    expect(out.markdown.match(/^<!-- page \d+ -->$/gm)).toEqual(['<!-- page 1 -->'])
  })

  it('reports the document information as declared, null where the PDF declares none', async () => {
    const out = ok(await pdfToMarkdown(writePdf([{ runs: lines(72, 720, ['Body']) }], { info: {
      Title: 'Kiln firing log', Author: 'Harbour office', Producer: 'W2L fixture writer', CreationDate: "D:20240315120000+01'00'", Subject: ' ',
    } })))
    expect(out.info).toEqual({
      pageCount: 1,
      title: 'Kiln firing log',
      author: 'Harbour office',
      subject: null,
      keywords: null,
      creator: null,
      producer: 'W2L fixture writer',
      creationDate: "D:20240315120000+01'00'",
      modificationDate: null,
      language: null,
      pdfVersion: '1.4',
      encrypted: false,
    })
  })

  it('stops at the page cap and reports it, keeping the declared page count', async () => {
    const pdf = writePdf(['One', 'Two', 'Three'].map((word) => ({ runs: lines(72, 720, [word]) })))
    const out = ok(await pdfToMarkdown(pdf, { maxPages: 2 }))
    expect(out.pages.map((page) => page.text)).toEqual(['One', 'Two'])
    expect(out.info.pageCount).toBe(3)
    expect(out.warnings).toContainEqual(expect.objectContaining({ code: 'page_cap' }))
  })

  it('stops when the time budget runs out, keeping the pages read so far', async () => {
    const pdf = writePdf(Array.from({ length: 40 }, (_, i) => ({ runs: lines(72, 720, [`Page body ${i + 1}`]) })))
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 100))
    const out = ok(await pdfToMarkdown(pdf, { timeBudgetMs: 1500 }))
    expect(out.pages.length).toBeGreaterThan(0)
    expect(out.pages.length).toBeLessThan(40)
    expect(out.pages.map((page) => page.number)).toEqual(out.pages.map((_, i) => i + 1))
    expect(out.warnings).toContainEqual(expect.objectContaining({ code: 'time_budget' }))
    expect(await pdfToMarkdown(pdf, { timeBudgetMs: 0 })).toMatchObject({ ok: false, error: { code: 'time_budget' } })
  })

  it('returns an error result, never a throw, for encrypted, malformed and non-PDF input', async () => {
    const encrypted = await pdfToMarkdown(writePdf([{ runs: lines(72, 720, ['Secret']) }], { encrypt: true }))
    expect(encrypted).toMatchObject({ ok: false, error: { code: 'encrypted' } })
    const malformed = await pdfToMarkdown(Uint8Array.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 9 0 R', (c) => c.charCodeAt(0)))
    expect(malformed).toMatchObject({ ok: false, error: { code: 'malformed' } })
    const html = await pdfToMarkdown(new TextEncoder().encode('<!doctype html><title>Not found</title>'))
    expect(html).toMatchObject({ ok: false, error: { code: 'not_pdf' } })
    expect(await pdfToMarkdown(new Uint8Array(0))).toMatchObject({ ok: false, error: { code: 'not_pdf' } })
  })

  it('leaves the caller\'s bytes usable', async () => {
    const pdf = writePdf([{ runs: lines(72, 720, ['Hash me afterwards']) }])
    const copy = pdf.slice()
    ok(await pdfToMarkdown(pdf))
    expect(pdf).toEqual(copy)
  })
})
