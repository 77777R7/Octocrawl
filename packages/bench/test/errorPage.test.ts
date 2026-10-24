import { describe, expect, it } from 'vitest'
import { errorPageEvidence, extraFormats } from '../src/subjects/errorPage.js'

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

