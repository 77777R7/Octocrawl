import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractTf, htmlToMarkdown } from '../src/index.js'

// Synthetic pages built like an IETF RFC (xml2rfc) and a W3C Recommendation (respec): the publication header and the
// numbered chapters are siblings in <body>, with no article/main around them (PA D6; the field gold set's H01, RFC 9110,
// and H07, WCAG 2.2, lost their headers this way). The text is invented; only the structure follows the real pages.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/standards/${name}`, import.meta.url), 'utf8')
const RFC = fixture('ietf-rfc.html')
const W3C = fixture('w3c-recommendation.html')

const markdown = (html: string, options = {}) => htmlToMarkdown(extractTf.extract(html, options).mainHtml)

function expectInOrder(md: string, values: string[]): void {
  let from = 0
  for (const value of values) {
    const at = md.indexOf(value, from)
    expect(at, value).toBeGreaterThanOrEqual(0)
    from = at + value.length
  }
}

describe('a standards document whose header and chapters are body siblings', () => {
  it('keeps an RFC header (number, title, stream, category, date, authors) ahead of every chapter', () => {
    const md = markdown(RFC)
    expectInOrder(md, [
      'Internet Engineering Task Force (IETF)', '9990', 'Standards Track', 'March 2026', 'A. Writer', 'B. Editor', 'C. Reviewer',
      'RFC 9990', 'Example Message Semantics', 'Section 1 paragraph 1', 'Section 2 paragraph 3', 'Section 3 paragraph 3', 'References',
    ])
    // The table inside a chapter keeps its rows and columns.
    expect(md).toContain('| Code | Meaning | Reference |')
    expect(md).toContain('| 210 | Measured | Section 3.1 |')
    expect(md).toContain('| 410 | Withdrawn | Section 3.2 |')
  })

  it('keeps a W3C header (title, status, date, editors) and the chapters after it', () => {
    const md = markdown(W3C)
    expectInOrder(md, [
      'Example Content Guidelines 9.1', 'W3C Recommendation', '05 March 2026', 'Dana Example', 'Lee Sample',
      'Guideline 1.1 requirement 1', 'Level A:', 'Level AA:', 'Level AAA:', 'term 40',
    ])
    expect(md).toContain('| Level | Criteria |')
    expect(md).toContain('| AAA | 7 |')
    // The definition pop-ups after the last chapter are not content.
    expect(md).not.toContain('Referenced in:')
  })
})

// An article page laid out without article/main: a site navigation, the post, a sidebar and a footer.
function articlePage(post: string): string {
  return `<!doctype html><html><head><title>Field notes</title></head><body>
<div class="site-header"><a href="/">Field notes</a> <ul class="menu"><li><a href="/about">About us</a></li><li><a href="/archive">Archive</a></li></ul></div>
<nav><a href="/">Home</a> <a href="/plans">Plans</a></nav>
${post}
<div class="sidebar"><h3>Popular</h3><ul><li><a href="/p/1">Older post one</a></li><li><a href="/p/2">Older post two</a></li></ul></div>
<footer><dl><dt>Company:</dt><dd>Field Notes Ltd</dd><dt>Updated:</dt><dd>1 January 2026</dd></dl><p>Unrelated company footer and promotional messages.</p></footer>
</body></html>`
}
const step = (n: number, wrap = 'section') =>
  `<${wrap}><h2>${n}. Step ${n}</h2>${[1, 2, 3].map((i) => `<p>Step ${n}, paragraph ${i}: calibrate the station before each reading and write down the unit and the date beside the value you measured.</p>`).join('')}</${wrap}>`

describe('pages that are not a sibling-chapter document', () => {
  it('does not take an article page’s navigation or footer as a document header', () => {
    const md = markdown(articlePage(`<div class="post"><h1>Calibrating a weather station</h1><p class="byline">By A. Writer, 3 March 2026</p>${[1, 2, 3, 4].map((n) => step(n)).join('')}</div>`))
    expect(md).toContain('Calibrating a weather station')
    expect(md).toContain('Step 4, paragraph 3')
    for (const chrome of ['About us', 'Archive', 'Plans', 'Field Notes Ltd', 'Unrelated company footer', 'Older post one']) expect(md).not.toContain(chrome)
  })

  it('leaves out the navigation and footer when numbered chapters are body siblings', () => {
    const md = markdown(articlePage(`<div class="post-head"><h1>Calibrating a weather station</h1><p>By A. Writer, 3 March 2026</p></div>${[1, 2, 3].map((n) => step(n)).join('')}`))
    expectInOrder(md, ['Calibrating a weather station', 'By A. Writer, 3 March 2026', 'Step 1, paragraph 1', 'Step 3, paragraph 3'])
    for (const chrome of ['About us', 'Archive', 'Plans', 'Field Notes Ltd', 'Unrelated company footer']) expect(md).not.toContain(chrome)
  })

  it('does not widen to the body for unnumbered, out-of-order or too few sections', () => {
    const head = '<div class="post-head"><h1>Calibrating a weather station</h1><p>By A. Writer, 3 March 2026</p></div>'
    const pages = [
      head + [1, 2, 3].map((n) => step(n)).join('').replace(/<h2>\d\. /g, '<h2>'),
      head + [1, 3, 4].map((n) => step(n)).join(''),
      head + [1, 2].map((n) => step(n)).join(''),
    ]
    for (const page of pages) expect(markdown(articlePage(page))).not.toContain('By A. Writer')
  })

  it('needs the page heading before the chapters', () => {
    const late = articlePage(`<div class="post-head"><p>By A. Writer, 3 March 2026</p></div>${[1, 2, 3].map((n) => step(n)).join('')}<h1>Late unrelated title</h1>`)
    expect(markdown(late)).not.toContain('By A. Writer')
  })

  it('still prefers an explicit article over sibling chapters', () => {
    const article = `<article><h1>Independent article</h1>${'<p>This independent report records a different measurement and explains how the station equipment was calibrated.</p>'.repeat(40)}</article>`
    const md = markdown(articlePage(`<div class="post-head"><h1>Calibrating a weather station</h1><p>By A. Writer, 3 March 2026</p></div>${[1, 2, 3].map((n) => step(n)).join('')}${article}`))
    expect(md).toContain('Independent article')
    expect(md).not.toContain('By A. Writer')
  })

  it('honours includeSelectors and pruneSelectors on a standards document', () => {
    expect(markdown(RFC, { includeSelectors: ['#conformance'] })).not.toContain('Standards Track')
    const pruned = markdown(RFC, { pruneSelectors: ['#collected\\.abnf'] })
    expect(pruned).toContain('Standards Track')
    expect(pruned).not.toContain('measure-1 =')
  })
})
