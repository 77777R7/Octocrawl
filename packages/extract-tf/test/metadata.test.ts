import { describe, expect, it } from 'vitest'
import { collectLinks, extractTf, readPageMetadata } from '../src/index.js'
import { parse } from '../src/dom.js'

const HEAD =
  '<title>\n  Tide tables  \n</title>' +
  '<meta name="Description" content="  Predicted  tides for the estuary. ">' +
  '<meta name="keywords" content="tides, estuary,,harbour ">' +
  '<meta name="robots" content="noindex, follow">' +
  '<base href="https://tides.example/data/">' +
  '<link rel="shortcut icon" href="../icons/wave.png">' +
  '<link rel="canonical" href="tables/2026">'

const BODY =
  '<nav><a href="/">Home</a> <a href="/about">About the tide office</a></nav>' +
  '<main><article><h1>Tide tables</h1>' +
  '<p>The estuary tables are recomputed every spring from the gauge record kept at the harbour office.</p>' +
  '<p>Each prediction lists the time and height at the reference station, corrected for the local datum.</p>' +
  '<p>The corrections are published beside the tables so that a reader can trace every figure back to the gauge.</p>' +
  '</article></main><footer><p>Maintained by the tide office. Figures are public records.</p></footer>'

describe('readPageMetadata', () => {
  it('reads the head, collapsing whitespace and resolving links against <base>', () => {
    const doc = parse(`<!doctype html><html lang="en"><head>${HEAD}</head><body>${BODY}</body></html>`)
    expect(readPageMetadata(doc.document, 'https://tides.example/page')).toEqual({
      title: 'Tide tables',
      description: 'Predicted tides for the estuary.',
      language: 'en',
      keywords: ['tides', 'estuary', 'harbour'],
      robots: 'noindex, follow',
      canonical: 'https://tides.example/data/tables/2026',
      favicon: 'https://tides.example/icons/wave.png',
    })
    doc.close()
  })

  it('leaves everything the page does not state as null', () => {
    const doc = parse('<!doctype html><html><head></head><body><p>Bare page.</p></body></html>')
    expect(readPageMetadata(doc.document, 'https://tides.example/')).toEqual({
      title: null,
      description: null,
      language: null,
      keywords: null,
      robots: null,
      canonical: null,
      favicon: null,
    })
    doc.close()
  })

  it('falls back to the content-language header meta for the language', () => {
    const doc = parse('<!doctype html><html><head><meta http-equiv="Content-Language" content="fr-CA"></head><body></body></html>')
    expect(readPageMetadata(doc.document).language).toBe('fr-CA')
    doc.close()
  })
})

describe('extract with onlyMainContent', () => {
  const html = `<!doctype html><html lang="en"><head>${HEAD}</head><body>${BODY}</body></html>`

  it('returns the main region by default and carries the metadata', () => {
    const out = extractTf.extract(html, { url: 'https://tides.example/page' })
    expect(out.mainHtml).toContain('recomputed every spring')
    expect(out.mainHtml).not.toContain('About the tide office')
    expect(out.mainHtml).not.toContain('Maintained by the tide office')
    expect(out.metadata?.title).toBe('Tide tables')
    expect(out.metadata?.canonical).toBe('https://tides.example/data/tables/2026')
  })

  it('returns the cleaned whole page when asked, with the same routing verdict', () => {
    const main = extractTf.extract(html, { url: 'https://tides.example/page' })
    const whole = extractTf.extract(html, { url: 'https://tides.example/page', onlyMainContent: false })
    expect(whole.mainHtml).toContain('About the tide office')
    expect(whole.mainHtml).toContain('Maintained by the tide office')
    expect(whole.mainHtml).toContain('recomputed every spring')
    expect(whole.mainHtml).not.toContain('<script')
    expect(whole.escalate).toBe(false)
    expect(whole.confidence).toBe(main.confidence)
    expect(whole.strategy).toBe(main.strategy)
  })
})

describe('collectLinks', () => {
  it('drops page assets and keeps documents', () => {
    const html =
      '<a href="/reports/2026.pdf">Report</a><a href="/data/tides.csv">CSV</a><a href="/static/logo.png">Logo</a>' +
      '<a href="/theme.css">Theme</a><a href="/app.js">App</a><a href="/archive.zip">Archive</a><a href="/photo.JPG">Photo</a><a href="/tables/2026">Tables</a>'
    expect(collectLinks(html, 'https://tides.example/')).toEqual([
      'https://tides.example/reports/2026.pdf',
      'https://tides.example/data/tides.csv',
      'https://tides.example/archive.zip',
      'https://tides.example/tables/2026',
    ])
  })
})
