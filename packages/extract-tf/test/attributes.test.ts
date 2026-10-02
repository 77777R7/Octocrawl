import { describe, expect, it } from 'vitest'
import { extractAttributes } from '../src/index.js'

const PAGE = `<!doctype html><html><head><title>Newest</title></head><body>
<table><tr class="athing" id="101"><td><span class="titleline"><a href="https://a.test/one">One</a></span></td></tr>
<tr class="athing" id="102"><td><span class="titleline"><a href="/item?id=102">Two</a></span></td></tr>
<tr class="athing"><td><span class="titleline"><a>No link</a></span></td></tr>
<tr class="athing" id="104"><td><span class="titleline"><a HREF="relative/four">Four</a></span></td></tr></table>
<main><ul><li><a href="/crawl/item/1" data-rank="1">Item 1</a></li><li><a href="/crawl/item/2" data-rank="2">Item 2</a></li></ul></main>
</body></html>`

describe('extractAttributes', () => {
  it('returns each selector in request order with the attribute values as written, in document order, elements without the attribute skipped', () => {
    expect(extractAttributes(PAGE, [
      { selector: 'span.titleline > a', attribute: 'href' },
      { selector: 'tr.athing', attribute: 'id' },
      { selector: 'main ul a', attribute: 'data-rank' },
    ])).toEqual([
      // Not resolved: links and images carry the resolved forms.
      { selector: 'span.titleline > a', attribute: 'href', values: ['https://a.test/one', '/item?id=102', 'relative/four'] },
      { selector: 'tr.athing', attribute: 'id', values: ['101', '102', '104'] },
      { selector: 'main ul a', attribute: 'data-rank', values: ['1', '2'] },
    ])
  })

  it('gives [] for a selector that matches nothing or an attribute no element has, and reads attribute names case-insensitively', () => {
    expect(extractAttributes(PAGE, [{ selector: 'table.missing', attribute: 'id' }, { selector: 'tr.athing', attribute: 'data-none' }, { selector: 'tr.athing', attribute: 'ID' }]))
      .toEqual([
        { selector: 'table.missing', attribute: 'id', values: [] },
        { selector: 'tr.athing', attribute: 'data-none', values: [] },
        { selector: 'tr.athing', attribute: 'ID', values: ['101', '102', '104'] },
      ])
    expect(extractAttributes(PAGE, [])).toEqual([])
  })

  it('keeps document order for a selector list that mixes compound selectors and chains', () => {
    expect(extractAttributes(PAGE, [{ selector: 'main a, tr.athing', attribute: 'id' }])[0]!.values).toEqual(['101', '102', '104'])
    expect(extractAttributes(PAGE, [{ selector: 'tr.athing, main ul a', attribute: 'href' }])[0]!.values).toEqual(['/crawl/item/1', '/crawl/item/2'])
  })
})
