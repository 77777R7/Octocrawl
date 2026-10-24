import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import type { ListSpec } from '@w2l/contracts'
import { extractListRecords, listExtraction } from '../src/index.js'

const PAGE = `<!doctype html><html><head><title>Shop</title></head><body><main>
<article class="card"><h3><a href="/p/1">Kettle</a></h3><p class="price">£19.99</p><img src="img/1.png"><span class="stock">In stock</span></article>
<article class="card"><h3><a href="https://other.test/p/2">Toaster, 2-slice</a></h3><p class="price">  £24.50 </p><img src="/img/2.png"></article>
<article class="card"><h3><a href="/p/3">Mug "Big"</a></h3><p class="price"></p><img data-src="img/3.png"><span class="stock">Out of stock</span>
  <article class="card"><h3><a href="/p/nested">Nested card</a></h3></article>
</article>
</main></body></html>`

const SPEC: ListSpec = {
  type: 'list',
  itemSelector: 'article.card',
  fields: [
    { name: 'name', selector: 'h3 a' },
    { name: 'url', selector: 'h3 a', attribute: 'href' },
    { name: 'price', selector: '.price' },
    { name: 'image', selector: 'img', attribute: 'src' },
    { name: 'stock', selector: '.stock' },
  ],
}

describe('extractListRecords', () => {
  it('reads one record per item, each field from its first match in the item, links made absolute', () => {
    const records = extractListRecords(PAGE, 'https://shop.test/list?page=1', SPEC)
    expect(records.map((record) => record.values)).toEqual([
      { name: 'Kettle', url: 'https://shop.test/p/1', price: '£19.99', image: 'https://shop.test/img/1.png', stock: 'In stock' },
      { name: 'Toaster, 2-slice', url: 'https://other.test/p/2', price: '£24.50', image: 'https://shop.test/img/2.png', stock: null },
      { name: 'Mug "Big"', url: 'https://shop.test/p/3', price: null, image: null, stock: 'Out of stock' },
    ])
  })

  it('names what each record lacks, fills nothing in, and keeps where each was read', () => {
    const records = extractListRecords(PAGE, 'https://shop.test/list?page=1', SPEC, 2)
    expect(records.map((record) => record.missing)).toEqual([[], ['stock'], ['price', 'image']])
    expect(records.map((record) => record.source)).toEqual([0, 1, 2].map((index) => ({ url: 'https://shop.test/list?page=1', page: 2, index })))
  })

  it('a record inside another record is part of it, not a record of its own', () => {
    expect(extractListRecords(PAGE, 'https://shop.test/', SPEC)).toHaveLength(3)
  })

  it('a field without a selector reads the item itself; an itemSelector that matches nothing gives no records', () => {
    expect(extractListRecords('<ul><li>a</li><li> b  c </li></ul>', 'https://x.test/', { type: 'list', itemSelector: 'li', fields: [{ name: 'text' }] }).map((record) => record.values.text)).toEqual(['a', 'b c'])
    expect(extractListRecords(PAGE, 'https://x.test/', { ...SPEC, itemSelector: 'li.none' })).toEqual([])
  })

  it('bounds explicit records to the named region, keeping original selector context, base URL and evidence index', () => {
    const html = '<html><head><base href="https://cdn.test/items/"></head><body><main>' +
      '<section class="other"><div class="card"><a href="one">Other</a></div></section>' +
      '<section id="chosen"><div class="card"><a href="two">Chosen</a><span class="price">12</span></div></section></main></body></html>'
    const spec: ListSpec = { type: 'list', itemSelector: 'main .card', fields: [{ name: 'name', selector: 'a' }, { name: 'url', selector: 'a', attribute: 'href' }, { name: 'price', selector: '.price' }] }
    const records = extractListRecords(html, 'https://page.test/', spec, 1, undefined, { includeSelectors: ['#chosen'], excludeSelectors: ['#chosen .price'] })
    expect(records).toEqual([{ values: { name: 'Chosen', url: 'https://cdn.test/items/two', price: null }, missing: ['price'], source: { url: 'https://page.test/', page: 1, index: 1 } }])
    expect(extractListRecords(html, 'https://page.test/', spec, 1, undefined, { includeSelectors: ['#missing'] })).toEqual([])
  })
})

describe('extractListRecords, as a reader sees the page', () => {
  it('resolves links against the page\'s <base href>, as links does', () => {
    const html = '<html><head><base href="https://cdn.example/shop/"></head><body><div class="c"><a href="p/1">One</a></div></body></html>'
    expect(extractListRecords(html, 'https://site.example/list/page', { type: 'list', itemSelector: 'div.c', fields: [{ name: 'url', selector: 'a', attribute: 'href' }] })[0]!.values.url).toBe('https://cdn.example/shop/p/1')
  })

  it('reads text without scripts or styles, blocks kept apart, inline text kept whole', () => {
    const html = '<div class="card"><h3>Kettle</h3><p>£19.<b>99</b></p><script>window.x={"sku":1}</script><style>.a{color:red}</style></div>'
    expect(extractListRecords(html, 'https://x.test/', { type: 'list', itemSelector: 'div.card', fields: [{ name: 'all' }] })[0]!.values.all).toBe('Kettle £19.99')
  })

  it('reads an SVG\'s text (a rating), not its title', () => {
    const html = '<div class="c"><svg><title>Rating</title><text>4.5</text></svg> stars</div>'
    expect(extractListRecords(html, 'https://x.test/', { type: 'list', itemSelector: 'div.c', fields: [{ name: 'all' }] })[0]!.values.all).toBe('4.5 stars')
  })

  it('stops at its limits and says it was cut', () => {
    const html = `<ul>${'<li>x</li>'.repeat(30)}</ul>`
    const spec: ListSpec = { type: 'list', itemSelector: 'li', fields: [{ name: 't' }] }
    const byCount = extractListRecords(html, 'https://x.test/', spec, 1, { records: 10, chars: 1_000 })
    expect([byCount.length, byCount.cut]).toEqual([10, true])
    const byChars = extractListRecords(html, 'https://x.test/', spec, 1, { records: 100, chars: 5 })
    expect([byChars.length, byChars.cut]).toEqual([5, true])
    expect(extractListRecords(html, 'https://x.test/', spec).cut).toBeUndefined()
    expect(listExtraction(spec, byCount, 1, true).truncated).toBe(true)
  })
})

describe('extractListRecords, the columns of a selected table row', () => {
  // Minimized from reserved v2 V28 (postgresql.org), V27 (php.net) and V22 (endoflife.date).
  const VERSIONS = '<table class="t"><thead><tr><th>Version</th><th>Current minor</th><th>First Release</th></tr></thead><tbody>' +
    '<tr><td>18</td><td>18.6</td><td>September 25, 2025</td></tr><tr><td>17</td><td> </td><td>September 26, 2024</td></tr></tbody></table>'
  const spec = (itemSelector: string): ListSpec => ({ type: 'list', itemSelector, fields: [{ name: 'version', selector: 'td' }] })
  const columns = (html: string, itemSelector: string) => extractListRecords(html, 'https://x.test/', spec(itemSelector), 1, undefined, {}, { columns: true }).columns

  it('reads each header of the table with the row\'s text under it, only when asked', () => {
    expect(columns(VERSIONS, 'table.t > tbody > tr')).toEqual([
      [{ header: 'Version', column: 1, value: '18', fields: ['version'] }, { header: 'Current minor', column: 2, value: '18.6' }, { header: 'First Release', column: 3, value: 'September 25, 2025' }],
      [{ header: 'Version', column: 1, value: '17', fields: ['version'] }, { header: 'Current minor', column: 2, value: null }, { header: 'First Release', column: 3, value: 'September 26, 2024' }],
    ])
    expect(extractListRecords(VERSIONS, 'https://x.test/', spec('table.t > tbody > tr')).columns).toBeUndefined()
  })

  it('gives a header that spans columns the text of every cell under it, and finds a header row of th cells outside a thead', () => {
    const branches = '<table class="standard"><tr><th>Branch</th><th colspan="2">Initial Release</th><th>Notes</th></tr>' +
      '<tr class="security"><td><a href="/downloads.php?version=8.2">8.2</a></td><td>8 Dec 2022</td><td><em>3 years, 10 months ago</em></td><td colspan="2">Migration guide</td></tr></table>'
    expect(columns(branches, 'tr.security')).toEqual([[
      { header: 'Branch', column: 1, value: '8.2', fields: ['version'] }, { header: 'Initial Release', column: 2, value: '8 Dec 2022 3 years, 10 months ago' }, { header: 'Notes', column: 4, value: 'Migration guide' },
    ]])
  })

  it('reads no columns for an item that is not a table row, a header row, a table with no or two header rows, or one with a cell spanning rows', () => {
    expect(columns('<ul><li>18</li></ul>', 'li')).toEqual([null])
    expect(columns(VERSIONS, 'thead tr')).toEqual([null])
    expect(columns('<table><tr><td>18</td><td>18.6</td></tr></table>', 'tr')).toEqual([null])
    expect(columns('<table><thead><tr><th colspan="2">Releases</th></tr><tr><th>Version</th><th>Minor</th></tr></thead><tbody><tr><td>18</td><td>18.6</td></tr></tbody></table>', 'tbody tr')).toEqual([null])
    expect(columns('<table><thead><tr><th>Version</th><th>Minor</th></tr></thead><tbody><tr><td rowspan="2">18</td><td>18.6</td></tr><tr><td>18.5</td></tr></tbody></table>', 'tbody tr')).toEqual([null, null])
  })

  it('names the list fields read from a cell under each header, and gives each column what its table states: its caption and the blocks back to its heading', () => {
    // Minimized from reserved v2 V25 (rba.gov.au): a caption, a header cell with no text, and a date per column.
    const rates = '<section><h1>Exchange Rates</h1><p>The Reserve Bank publishes the Trade Weighted Index and these rates; they should not be relied upon for any regulatory or commercial purposes.</p><h2>Latest Exchange Rates</h2>' +
      '<table class="table-linear"><caption>Units of Foreign  Currencies per Australian Dollar</caption><thead><tr><td></td><th scope="col">16 Oct 2026</th><th scope="col"><strong>19 Oct 2026</strong></th></tr></thead>' +
      '<tbody><tr><th scope="row">United States dollar</th><td>0.6947</td><td class="highlight">0.6975</td></tr></tbody></table></section>'
    const rateSpec: ListSpec = { type: 'list', itemSelector: 'table.table-linear > tbody > tr', fields: [{ name: 'currency', selector: 'th[scope=row]' }, { name: 'rate', selector: 'td.highlight' }] }
    const table = { caption: 'Units of Foreign Currencies per Australian Dollar', before: [{ text: 'Latest Exchange Rates', element: 'h2', distance: 1 }] }
    expect(extractListRecords(rates, 'https://x.test/', rateSpec, 1, undefined, {}, { columns: true }).columns).toEqual([[
      { header: '16 Oct 2026', column: 2, value: '0.6947', table },
      { header: '19 Oct 2026', column: 3, value: '0.6975', fields: ['rate'], table },
    ]])
    // Minimized from reserved v2 V34 (x-rates.com): no caption, a timestamp between the heading and the table, a field inside a link.
    const top = '<div class="grid"><div class="moduleContent"><h1 class="basicH1 ratestableH1"><span>US Dollar Exchange Rates Table</span> <a href="#converter">Converter</a></h1>' +
      '<span class="ratesTablePopu">Top 10</span>\n<span class="ratesTimestamp">Jan 01, 2026 03:50 UTC</span>' +
      '<table class="ratesTable"><thead><tr><th>US Dollar</th><th>1.00 USD</th><th>inv. 1.00 USD</th></tr></thead><tbody>' +
      '<tr><td>Euro</td><td class="rtRates"><a href="/graph/?from=USD&amp;to=EUR">0.890579</a></td><td class="rtRates"><a href="/graph/?from=EUR&amp;to=USD">1.122865</a></td></tr></tbody></table></div></div>'
    const topSpec: ListSpec = { type: 'list', itemSelector: 'table.ratesTable > tbody > tr', fields: [{ name: 'currency', selector: 'td' }, { name: 'rate', selector: 'td.rtRates a[href*="from=USD"]' }] }
    const before = [
      { text: 'Jan 01, 2026 03:50 UTC', element: 'span.ratesTimestamp', distance: 1 },
      { text: 'Top 10', element: 'span.ratesTablePopu', distance: 2 },
      { text: 'US Dollar Exchange Rates Table Converter', element: 'h1.basicH1', distance: 3 },
    ]
    expect(extractListRecords(top, 'https://x.test/', topSpec, 1, undefined, {}, { columns: true }).columns).toEqual([[
      { header: 'US Dollar', column: 1, value: 'Euro', fields: ['currency'], table: { caption: null, before } },
      { header: '1.00 USD', column: 2, value: '0.890579', fields: ['rate'], table: { caption: null, before } },
      { header: 'inv. 1.00 USD', column: 3, value: '1.122865', table: { caption: null, before } },
    ]])
  })

  it('reads before a table only short blocks back to its heading: a long paragraph, a list or another table ends them, and a table first in its wrapper looks before the wrapper', () => {
    const body = '<table class="r"><thead><tr><th>Rate</th></tr></thead><tbody><tr><td>1.5</td></tr></tbody></table>'
    const tableOf = (html: string) => extractListRecords(html, 'https://x.test/', spec('table.r tbody tr'), 1, undefined, {}, { columns: true }).columns![0]![0]!.table
    expect(tableOf(`<p>${'Rates are published daily. '.repeat(12)}</p><p>As at 19 Oct 2026</p>${body}`)).toEqual({ caption: null, before: [{ text: 'As at 19 Oct 2026', element: 'p', distance: 1 }] })
    expect(tableOf(`<h3>Rates</h3><ul><li>Updated 18 Oct 2026</li></ul>${body}`)).toBeUndefined()
    expect(tableOf(`<h3>Rates</h3><table><tr><td>19 Oct 2026</td></tr></table>${body}`)).toBeUndefined()
    expect(tableOf(`<h2 id="r">Rates</h2><script>var x = 1</script><div class="shell"><div>${body}</div></div>`)).toEqual({ caption: null, before: [{ text: 'Rates', element: 'h2#r', distance: 1 }] })
    expect(tableOf(body)).toBeUndefined()
  })

  it('stops reading columns once their text would pass the characters budget', () => {
    const wide = `<table><thead><tr>${'<th>h</th>'.repeat(10)}</tr></thead><tbody>${'<tr><td colspan="10">abcdefghi</td></tr>'.repeat(3)}</tbody></table>`
    const read = extractListRecords(wide, 'https://x.test/', spec('tbody tr'), 1, { records: 10, chars: 250 }, {}, { columns: true })
    expect(read.map(record => record.values.version)).toEqual(['abcdefghi', 'abcdefghi', 'abcdefghi'])
    expect(read.columns!.map(row => row?.length ?? null)).toEqual([10, 10, null])
  })
})

describe('listExtraction', () => {
  it('writes RFC 4180 CSV with the fields, then source_url, page and index, and hashes it', () => {
    const records = extractListRecords(PAGE, 'https://shop.test/list', SPEC)
    const list = listExtraction(SPEC, records, 1)
    expect(list).toMatchObject({ itemSelector: 'article.card', fields: ['name', 'url', 'price', 'image', 'stock'], pages: 1, incomplete: 2, truncated: false })
    expect(list.csv.split('\r\n').slice(0, 4)).toEqual([
      'name,url,price,image,stock,source_url,page,index',
      'Kettle,https://shop.test/p/1,£19.99,https://shop.test/img/1.png,In stock,https://shop.test/list,1,0',
      '"Toaster, 2-slice",https://other.test/p/2,£24.50,https://shop.test/img/2.png,,https://shop.test/list,1,1',
      '"Mug ""Big""",https://shop.test/p/3,,,Out of stock,https://shop.test/list,1,2',
    ])
    expect(list.csvSha256).toBe(createHash('sha256').update(list.csv, 'utf8').digest('hex'))
  })
})
