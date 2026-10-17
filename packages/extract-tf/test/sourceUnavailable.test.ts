import { describe, expect, it } from 'vitest'
import { extractTf, htmlToMarkdown } from '../src/index.js'
const TITLE = "Statistics Canada - We're sorry! The website is currently unavailable"
const NOTICE = "<p>We're sorry! The website is currently unavailable. Please try again later.</p>"
const page = (body: string, title = TITLE) => `<html><head><title>${title}</title></head><body><main>${body}</main></body></html>`
describe('page-wide source outage signal', () => {
  it.each([
    page(NOTICE),
    page('<p>Le site Web n’est pas disponible pour le moment.</p>', 'Le site Web n’est pas disponible pour le moment'),
  ])('requires the title and an active visible notice', html => {
    const result = extractTf.extract(html)
    expect(result.sourceUnavailable).toBe(true)
    expect(htmlToMarkdown(result.mainHtml)).toContain(html.includes('disponible') ? 'disponible' : 'unavailable')
  })
  it.each([
    page(NOTICE, 'Population report'),
    page(`<p>The report explains an outage last year.</p>`),
    page(`<div hidden>${NOTICE}</div><p>Normal report content.</p>`),
    page(`<div style="display: none !important">${NOTICE}</div><p>Normal report content.</p>`),
    page(`<div style="visibility: hidden">${NOTICE}</div><p>Normal report content.</p>`),
    page(`<div data-w2l-hidden>${NOTICE}</div><p>Normal report content.</p>`),
    page(`<blockquote>${NOTICE}</blockquote><p>Normal report content.</p>`),
    page(`<p>“The website is currently unavailable” was last year's message.</p>`),
    page(`<p>Currently unavailable.</p>`, 'Product unavailable'),
    page(`${NOTICE}<p>${'The report describes observations and their dates and units. '.repeat(20)}</p>`),
    page(`${NOTICE}<table><tr><th>Year</th><th>Population</th></tr><tr><td>2025</td><td>123456</td></tr></table>`),
    page(`${NOTICE}<div role="grid"><div role="row"><span role="columnheader">Year</span><span role="columnheader">Value</span></div><div role="row"><span role="gridcell">2025</span><span role="gridcell">123456</span></div></div>`),
  ])('does not promote metadata, hidden/quoted text, product notices or populated data into an outage', html => {
    expect(extractTf.extract(html).sourceUnavailable).toBeUndefined()
  })
  it('reads the source before caller exclusions and preserves extraction options', () => {
    const result = extractTf.extract(page(NOTICE), { pruneSelectors: ['p'] })
    expect(result.sourceUnavailable).toBe(true)
    expect(result.mainHtml).not.toContain('currently unavailable')
  })
})
