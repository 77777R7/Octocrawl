import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { extractListRecords } from '@w2l/extract-tf'
import { regionViewExpression } from '../src/regionWait.js'

/**
 * The region view of the live page (ADR 0007) reads records as the list format reads them on the captured HTML
 * (packages/extract-tf/src/list.ts): the same page, read both ways, gives the same records.
 */
const PAGE_URL = 'https://shop.test/catalogue/index.html'
const HTML = `<!doctype html><html><head><base href="https://cdn.shop.test/base/"><style>.wide { display: none }</style></head><body>
<ul>
  <li class="it"><a HREF="item/1">Alpha <span class="wide">(wide)</span></a> <span class="price"><span class="wide">$10.00</span></span><img srcset="a.jpg 1x, a2.jpg 2x"></li>
  <li class="it"><a href="/item/2">Beta<script>var x = 1</script><svg><title>icon</title><text>4.5</text></svg></a> <span class="price">  </span><img srcset=""></li>
  <li class="it"><a href="https://other.test/3"><div>Gamma</div><div>Delta</div></a> <span class="price">$30.00</span>
    <ul><li class="it"><a href="nested">Nested</a> <span class="price">$1</span></li></ul></li>
  <li class="it"><span class="price">$40.00</span></li>
</ul>
<table><tr><td>One row only</td></tr></table>
<table style="display: none"><tr><th>Hidden</th></tr><tr><td>table</td></tr></table>
<table><tr><th>Name</th></tr><tr><td>Shown</td></tr></table>
<div role="grid"><div role="row">a</div><div role="row">b</div></div>
</body></html>`

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await chromium.launch()
  page = await browser.newPage()
  await page.route('**/*', (route) => route.request().resourceType() === 'document' ? route.fulfill({ status: 200, contentType: 'text/html', body: HTML }) : route.abort())
  await page.goto(PAGE_URL)
}, 60_000)

afterAll(async () => {
  await browser?.close()
})

const view = async (list?: Parameters<typeof regionViewExpression>[0], max?: number) => JSON.parse(await page.evaluate(regionViewExpression(list, max)) as string) as { markdown: string; tableCount: number; list?: { records: { values: Record<string, string | null>; missing: string[] }[] }; error?: string }

describe('the region view of the live page (ADR 0007, ROADMAP PA item 11)', () => {
  it('reads the records the list format reads: nested items, first matches, text CSS hides, attributes and their URLs', async () => {
    const fields = [{ name: 'name', selector: 'a' }, { name: 'price', selector: '.price' }, { name: 'url', selector: 'a', attribute: 'href' }, { name: 'srcset', selector: 'img', attribute: 'srcset' }]
    const live = await view({ itemSelector: 'li.it', fields })
    const served = extractListRecords(HTML, PAGE_URL, { itemSelector: 'li.it', fields })
    expect(live.list?.records).toEqual(served.map(({ values, missing }) => ({ values, missing })))
    // What the comparison covers, spelled out.
    expect(live.list?.records.map((record) => record.values.name)).toEqual(['Alpha (wide)', 'Beta4.5', 'Gamma Delta', null])
    expect(live.list?.records[0]!.values).toMatchObject({ price: '$10.00', url: 'https://cdn.shop.test/base/item/1', srcset: 'a.jpg 1x, a2.jpg 2x' })
    expect(live.list?.records[1]!.missing).toEqual(['price', 'srcset'])
  })

  it('counts the tables a page shows of two rows or more, and reads no more records than it is asked for', async () => {
    const live = await view({ itemSelector: 'li.it', fields: [{ name: 'name', selector: 'a' }] }, 2)
    expect(live.tableCount).toBe(2)
    expect(live.list?.records).toHaveLength(2)
    expect(live.markdown).toContain('Shown')
  })

  it('leaves the list out, not the view, when the browser does not take its selector', async () => {
    const live = await view({ itemSelector: 'li[data-x!="none"]', fields: [{ name: 'name' }] })
    expect(live.error).toBeUndefined()
    expect(live.list).toBeUndefined()
    expect(live.tableCount).toBe(2)
  })
})
