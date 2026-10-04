import { describe, expect, it } from 'vitest'
import { errorPageEvidence } from '../src/subjects/errorPage.js'

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
