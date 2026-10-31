import { describe, expect, it } from 'vitest'
import { extractTf } from '@w2l/extract-tf'
import { errorPageEvidence, extraFormats, wholePageDelivered } from '../src/subjects/errorPage.js'

describe('the page an error status carried', () => {
  it('keeps the whole page when its content is only the extractor\'s last resort', () => {
    // A 404 with a list of suggestions beside its message: the list alone would drop what the server said.
    const tip = (text: string) => `<div class="tip"><span>${text}</span></div>`
    const html = `<html><body><h1>Page not found</h1><p>Sorry.</p><div class="tips">${tip('Check the address for typing mistakes and try again later')}${tip('Use the search box at the top of the page to find the article')}${tip('Start again from the home page and follow the section links')}</div></body></html>`
    const page = errorPageEvidence(404, 'text/html', html, 'https://site.test/missing')
    expect(page?.markdown).toContain('Page not found')
    expect(page?.markdown).toContain('Sorry.')
    expect(page?.markdown).toContain('Start again from the home page')
  })
})

describe('the selected list\'s table columns', () => {
  const html = '<table><thead><tr><th>Version</th><th>Current minor</th></tr></thead><tbody><tr><td>18</td><td>18.6</td></tr></tbody></table>'
  const list = { type: 'list' as const, itemSelector: 'tbody tr', fields: [{ name: 'version', selector: 'td' }] }
  it('are read only when the request asks for them, and are not part of the list', () => {
    expect(extraFormats(html, 'https://x.test/', { list }, [], 'http', 0).listColumns).toBeUndefined()
    const read = extraFormats(html, 'https://x.test/', { list, listColumns: true }, [], 'http', 0)
    expect(read.listColumns).toEqual([[{ header: 'Version', column: 1, value: '18', fields: ['version'] }, { header: 'Current minor', column: 2, value: '18.6' }]])
    expect(read.list!.records).toEqual([{ values: { version: '18' }, missing: [], source: { url: 'https://x.test/', page: 1, index: 0 } }])
    expect(extraFormats(html, 'https://x.test/', { list: { type: 'list', fields: list.fields }, listColumns: true }, [], 'http', 0).listColumns).toBeUndefined()
  })
})


describe('a page with no main region, answered with its whole page', () => {
  const long = 'x'.repeat(1001)
  const nav = `<nav><ul>${Array.from({ length: 40 }, (_, i) => `<li><a href="/c/${i}">Inventory category number ${i + 1}</a></li>`).join('')}</ul></nav>`
  it('only when the extractor found no region at all, a list task\'s unmatched items included', () => {
    expect(wholePageDelivered(extractTf.extract(`<html><body>${nav}</body></html>`), long, [], false, false)).toBe(true)
    // A region that only names the page (ROADMAP PA item 4) says its content has not come, with or without a list task.
    const named = `<html><body>${nav}<main><article><h1>Used Tesla Model 3 inventory</h1><h2>Don't see the Tesla you're looking for?</h2></article></main></body></html>`
    for (const includeSelectors of [undefined, ['.vehicle-card']]) {
      const out = extractTf.extract(named, { includeSelectors })
      expect(out.escalate).toBe(true)
      expect(wholePageDelivered(out, long, [], false, false)).toBe(false)
    }
  })
  it('not when it is 1,000 characters or less, cut short, still loading, or a list page', () => {
    const none = { noRegion: true }
    expect(wholePageDelivered(none, 'x'.repeat(1000), [], false, false)).toBe(false)
    expect(wholePageDelivered(none, null, [], false, false)).toBe(false)
    expect(wholePageDelivered(none, long, [], true, false)).toBe(false)
    expect(wholePageDelivered(none, long, [{ at: 0, lane: 'browser_local', event: 'loading_wait', detail: { waitedMs: 8000, cleared: false } }], false, false)).toBe(false)
    expect(wholePageDelivered(none, long, [{ at: 0, lane: 'browser_local', event: 'loading_wait', detail: { waitedMs: 900, cleared: true } }], false, false)).toBe(true)
    expect(wholePageDelivered(none, long, [], false, true)).toBe(false)
  })
})
