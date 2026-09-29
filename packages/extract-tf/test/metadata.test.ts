import { describe, expect, it } from 'vitest'
import { extractTf } from '../src/index.js'

const PROSE = '<p>The kiln reached 1240 degrees before the glaze vitrified. Every reading was logged in the ledger kept by the harbour office.</p>'

const PAGE = `<!doctype html><html lang="en-GB"><head>
<title>
  Kiln firing log | Harbour   Pottery
</title>
<meta name="description" content="Firing temperatures recorded at the harbour kiln, 1873 to 1890.">
<meta property="og:description" content="A social card blurb, not the description.">
<meta name="keywords" content="kiln, glaze, harbour">
<meta name="robots" content="noindex, follow">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="shortcut icon" href="/static/favicon.ico">
<link rel="canonical" href="/log/kiln">
</head><body>
<nav><a href="/">Home</a></nav>
<article><h1>Kiln temperatures and glaze vitrification</h1>${PROSE}${PROSE}</article>
</body></html>`

describe('page metadata', () => {
  it('reports what the page declares about itself, apart from the content title', () => {
    const out = extractTf.extract(PAGE, { url: 'https://pottery.test/log/kiln?print=1' })
    expect(out.title).toBe('Kiln temperatures and glaze vitrification')
    expect(out.metadata).toEqual({
      title: 'Kiln firing log | Harbour Pottery',
      description: 'Firing temperatures recorded at the harbour kiln, 1873 to 1890.',
      language: 'en-GB',
      keywords: 'kiln, glaze, harbour',
      robots: 'noindex, follow',
      favicon: 'https://pottery.test/static/favicon.ico',
      canonicalUrl: 'https://pottery.test/log/kiln',
    })
  })

  it('leaves what the page does not declare null: no og:description, no SVG title, no /favicon.ico', () => {
    const out = extractTf.extract(`<!doctype html><html><head><meta property="og:description" content="Only a social card.">
<link rel="apple-touch-icon" href="/apple-touch-icon.png"></head><body>
<svg role="img"><title>Harbour Pottery logo</title></svg>
<article><h1>Harbour report</h1>${PROSE}${PROSE}</article></body></html>`, { url: 'https://pottery.test/report' })
    expect(out.metadata).toEqual({ title: null, description: null, language: null, keywords: null, robots: null, favicon: null, canonicalUrl: null })
    expect(out.title).toBe('Harbour report')
  })

  it('resolves the icon and canonical URL against <base href>, keeping only http(s) URLs', () => {
    const html = (head: string) => `<!doctype html><html lang="en"><head><title>Glaze notes</title>${head}</head><body><article><h1>Glaze notes</h1>${PROSE}${PROSE}</article></body></html>`
    const based = extractTf.extract(html(`<base href="https://cdn.pottery.test/assets/">
<link rel="icon" href="data:image/png;base64,iVBORw0KGgo=">
<link rel="icon" sizes="32x32" href="icons/favicon-32.png">
<link rel="canonical" href="javascript:void(0)">`), { url: 'https://pottery.test/notes' })
    expect(based.metadata.favicon).toBe('https://cdn.pottery.test/assets/icons/favicon-32.png')
    expect(based.metadata.canonicalUrl).toBeNull()
    // A relative icon on a page whose URL is unknown cannot be resolved, so it is not reported.
    expect(extractTf.extract(html('<link rel="icon" href="/favicon.ico">')).metadata.favicon).toBeNull()
  })

  it('takes the language from Content-Language only when <html> has no lang attribute', () => {
    const language = (root: string) => extractTf.extract(`<!doctype html>${root}<head><title>Bericht</title>
<meta http-equiv="Content-Language" content="de"></head><body><article><h1>Bericht</h1>${PROSE}</article></body></html>`).metadata.language
    expect(language('<html>')).toBe('de')
    expect(language('<html lang="fr">')).toBe('fr')
    // lang="" declares the language unknown; it does not fall back to the pragma.
    expect(language('<html lang="">')).toBeNull()
  })

  it('reads upper-case tag and attribute names as HTML does', () => {
    const out = extractTf.extract(`<HTML LANG="EN"><HEAD><TITLE>EMPLOYMENT SITUATION</TITLE>
<META NAME="Description" CONTENT="Monthly labour market figures.">
<LINK REL="Shortcut Icon" HREF="/FAVICON.ICO"></HEAD><BODY><ARTICLE><H1>Summary</H1>${PROSE}</ARTICLE></BODY></HTML>`, { url: 'https://stats.test/news.release/empsit.htm' })
    expect(out.metadata).toMatchObject({
      title: 'EMPLOYMENT SITUATION',
      description: 'Monthly labour market figures.',
      language: 'EN',
      favicon: 'https://stats.test/FAVICON.ICO',
    })
  })
})
