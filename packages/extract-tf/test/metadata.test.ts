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
      // The og:description is reported under its own name, never as the description.
      ogDescription: 'A social card blurb, not the description.',
    })
  })

  it('leaves what the page does not declare null: no og:description, no SVG title, no /favicon.ico', () => {
    const out = extractTf.extract(`<!doctype html><html><head><meta property="og:description" content="Only a social card.">
<link rel="apple-touch-icon" href="/apple-touch-icon.png"></head><body>
<svg role="img"><title>Harbour Pottery logo</title></svg>
<article><h1>Harbour report</h1>${PROSE}${PROSE}</article></body></html>`, { url: 'https://pottery.test/report' })
    expect(out.metadata).toEqual({ title: null, description: null, language: null, keywords: null, robots: null, favicon: null, canonicalUrl: null, ogDescription: 'Only a social card.' })
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

  it('reads the Open Graph tags the page states, resolves their URLs against <base>, and leaves an empty or absent one out', () => {
    const out = extractTf.extract(`<!doctype html><html><head><title>Kiln report</title><base href="https://cdn.pottery.test/assets/">
<meta property="OG:Title" content=" Kiln report  2026 ">
<meta property="og:description" content="">
<meta property="og:url" content="https://pottery.test/report">
<meta property="og:image:secure_url" content="https://cdn.pottery.test/og/kiln.png">
<meta property="og:image" content="og/kiln-card.png">
<meta name="og:audio" content="audio/intro.mp3">
<meta property="og:video:url" content="https://media.pottery.test/kiln.mp4">
<meta property="og:determiner" content="the">
<meta property="og:locale" content="en_GB">
<meta property="og:locale:alternate" content="fr_FR">
<meta property="og:locale:alternate" content="de_DE">
<meta property="og:site_name" content="Harbour Pottery">
<meta property="og:image" content="og/second.png"></head><body><article><h1>Kiln report</h1>${PROSE}${PROSE}</article></body></html>`, { url: 'https://pottery.test/report' })
    expect(out.metadata).toMatchObject({
      ogTitle: 'Kiln report 2026',
      ogUrl: 'https://pottery.test/report',
      // og:image wins over its secure_url and url forms, and the first og:image wins; a relative one is resolved against <base>.
      ogImage: 'https://cdn.pottery.test/assets/og/kiln-card.png',
      ogAudio: 'https://cdn.pottery.test/assets/audio/intro.mp3',
      ogVideo: 'https://media.pottery.test/kiln.mp4',
      ogDeterminer: 'the',
      ogLocale: 'en_GB',
      ogLocaleAlternate: ['fr_FR', 'de_DE'],
      ogSiteName: 'Harbour Pottery',
    })
    // An empty content is no declaration, and the base fields keep their shape.
    expect(out.metadata).not.toHaveProperty('ogDescription')
    expect(out.metadata.description).toBeNull()
    // A page without the tags keeps exactly the seven fields.
    const plain = extractTf.extract(`<!doctype html><html lang="en"><head><title>Glaze notes</title></head><body><article><h1>Glaze notes</h1>${PROSE}${PROSE}</article></body></html>`, { url: 'https://pottery.test/notes' })
    expect(Object.keys(plain.metadata).sort()).toEqual(['canonicalUrl', 'description', 'favicon', 'keywords', 'language', 'robots', 'title'])
  })

  it('reads Dublin Core and article tags verbatim, in any case, and invents none from govuk:* or citation_* tags', () => {
    const out = extractTf.extract(`<!doctype html><html><head><title>Consumption report</title>
<meta name="DCTERMS.created" content="2025-12-18">
<meta name="dc.date.created" content="2025-12-18T09:30:08+00:00">
<meta name="DC.date" content="18 December 2025">
<meta name="dcterms.type" content="Text">
<meta name="dc.type" content="statistics">
<meta name="dcterms.audience" content="analysts">
<meta name="dcterms.subject" content="energy">
<meta name="dc.subject" content="electricity, gas">
<meta name="dc.description" content="Regional   consumption figures.">
<meta name="dcterms.keywords" content="subnational, consumption">
<meta property="article:published_time" content="2025-12-18T09:30:08+00:00">
<meta name="article:modified_time" content="2026-01-05T10:00:00Z">
<meta property="article:section" content="Statistics">
<meta property="article:tag" content="energy">
<meta property="article:tag" content="regions"></head><body><article><h1>Consumption report</h1>${PROSE}${PROSE}</article></body></html>`)
    expect(out.metadata).toMatchObject({
      dcTermsCreated: '2025-12-18',
      dcDateCreated: '2025-12-18T09:30:08+00:00',
      dcDate: '18 December 2025',
      dcTermsType: 'Text',
      dcType: 'statistics',
      dcTermsAudience: 'analysts',
      dcTermsSubject: 'energy',
      dcSubject: 'electricity, gas',
      dcDescription: 'Regional consumption figures.',
      dcTermsKeywords: 'subnational, consumption',
      publishedTime: '2025-12-18T09:30:08+00:00',
      modifiedTime: '2026-01-05T10:00:00Z',
      articleSection: 'Statistics',
      articleTag: ['energy', 'regions'],
    })
    const govuk = extractTf.extract(`<!doctype html><html><head><title>Report</title>
<meta name="govuk:first-published-at" content="2025-12-18T09:30:08+00:00">
<meta name="citation_publication_date" content="2017/06/12"></head><body><article><h1>Report</h1>${PROSE}${PROSE}</article></body></html>`).metadata
    for (const key of ['dcTermsCreated', 'dcDate', 'publishedTime', 'modifiedTime', 'articleTag', 'articleSection']) expect(govuk).not.toHaveProperty(key)
  })
})
