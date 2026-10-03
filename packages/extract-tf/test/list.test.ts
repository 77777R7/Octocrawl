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

describe('listExtraction', () => {
  it('writes RFC 4180 CSV with the fields, then source_url, page and index, and hashes it', () => {
    const records = extractListRecords(PAGE, 'https://shop.test/list', SPEC)
    const list = listExtraction(SPEC, records, 1)
    expect(list).toMatchObject({ itemSelector: 'article.card', fields: ['name', 'url', 'price', 'image', 'stock'], pages: 1, incomplete: 2 })
    expect(list.csv.split('\r\n').slice(0, 4)).toEqual([
      'name,url,price,image,stock,source_url,page,index',
      'Kettle,https://shop.test/p/1,£19.99,https://shop.test/img/1.png,In stock,https://shop.test/list,1,0',
      '"Toaster, 2-slice",https://other.test/p/2,£24.50,https://shop.test/img/2.png,,https://shop.test/list,1,1',
      '"Mug ""Big""",https://shop.test/p/3,,,Out of stock,https://shop.test/list,1,2',
    ])
    expect(list.csvSha256).toBe(createHash('sha256').update(list.csv, 'utf8').digest('hex'))
  })
})
