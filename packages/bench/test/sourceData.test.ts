import { describe, expect, it } from 'vitest'
import { sourceDataWarnings, SOURCE_DATA_MAX_CHARS } from '../src/subjects/sourceData.js'

const url = 'https://www.walmart.com/browse/electronics/laptops/123'
function state() {
  return { page: '/browse/[...seo]', query: { seo: ['electronics', 'laptops', '123'] }, props: { pageProps: { initialData: {
    searchResult: { itemStacks: [] as unknown[] },
    pageMetadata: { pageContext: { browseContext: { errorResponse: { errors: [{ errorType: 'FATAL', statusCode: 'POLARIS_1001', statusMsg: 'INVALID_CAT_ID' }] } } } },
  } } } }
}
const html = (data: unknown, body = '') => `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></head><body><main>${body}</main></body></html>`

describe('publisher data errors', () => {
  it('requires the requested browse target, fatal publisher error, empty stacks and no product markup together', () => {
    expect(sourceDataWarnings(html(state()), url)).toMatchObject([{ code: 'source_data_error', message: expect.stringContaining('INVALID_CAT_ID') }])
  })

  it('keeps populated or hydrated products and recoverable warnings out of the error classification', () => {
    const populated = state(); populated.props.pageProps.initialData.searchResult.itemStacks.push({ items: [{ name: 'Laptop' }] })
    const recoverable = state(); recoverable.props.pageProps.initialData.pageMetadata.pageContext.browseContext.errorResponse.errors[0]!.errorType = 'WARNING'
    for (const body of [html(populated), html(recoverable), html(state(), '<a href="/ip/laptop/42">Laptop $100</a>')]) expect(sourceDataWarnings(body, url)).toEqual([])
  })

  it('requires actual state for this target; unrelated modules, articles and hidden notices do not classify', () => {
    const wrong = state(); wrong.query.seo = ['other', '123']
    for (const body of [html(wrong), html({ errors: state().props }), '<article><h1>INVALID_CAT_ID guide</h1></article>', '<table></table><div class="hide">Data currently unavailable</div>', `<!-- ${html(state())} -->`, html(state()).replace('application/json', 'text/plain')]) expect(sourceDataWarnings(body, url)).toEqual([])
    for (const target of ['https://docs.example/error', 'https://www.nasdaq.com/market-activity/stocks/aapl/historical', 'https://www.walmart.com/ip/laptop/123', 'not a url']) expect(sourceDataWarnings(html(state()), target)).toEqual([])
  })

  it('leaves incomplete, malformed and oversized state unknown', () => {
    const noStacks = state(); delete (noStacks.props.pageProps.initialData.searchResult as { itemStacks?: unknown }).itemStacks
    for (const body of [html(null), html(42), html(noStacks), '<script id="__NEXT_DATA__">{broken</script>', html(state()) + ' '.repeat(SOURCE_DATA_MAX_CHARS)]) expect(sourceDataWarnings(body, url)).toEqual([])
  })
})
