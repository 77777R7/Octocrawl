import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import type { ListFormatRequest } from '@w2l/contracts'
import { extractListRecords, listExtraction } from '../src/index.js'

const PAGE = `<!doctype html><html><head><title>Shop</title></head><body><main>
<article class="card"><h3><a href="/p/1">Kettle</a></h3><p class="price">£19.99</p><img src="img/1.png"><span class="stock">In stock</span></article>
<article class="card"><h3><a href="https://other.test/p/2">Toaster, 2-slice</a></h3><p class="price">  £24.50 </p><img src="/img/2.png"></article>
<article class="card"><h3><a href="/p/3">Mug "Big"</a></h3><p class="price"></p><img data-src="img/3.png"><span class="stock">Out of stock</span>
  <article class="card"><h3><a href="/p/nested">Nested card</a></h3></article>
</article>
</main></body></html>`

const SPEC: ListFormatRequest = {
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
    const spec: ListFormatRequest = { type: 'list', itemSelector: 'li', fields: [{ name: 't' }] }
    const byCount = extractListRecords(html, 'https://x.test/', spec, 1, { records: 10, chars: 1_000 })
    expect([byCount.length, byCount.cut]).toEqual([10, true])
    const byChars = extractListRecords(html, 'https://x.test/', spec, 1, { records: 100, chars: 5 })
    expect([byChars.length, byChars.cut]).toEqual([5, true])
    expect(extractListRecords(html, 'https://x.test/', spec).cut).toBeUndefined()
    expect(listExtraction(spec, byCount, 1, true).truncated).toBe(true)
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
