import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { localNetworkPolicy } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

const HTML = '<html><head><title>Stationery</title><script type="application/ld+json">' +
  JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Delivery membership', offers: { '@type': 'Offer', price: '99.00', priceCurrency: 'USD' } }) +
  '</script></head><body><nav>Delivery membership $99.00</nav><main id="chosen">' +
  '<article class="item featured"><h2>Field notebook</h2><p class="price">$12.00</p><time>2026-10-14</time><a href="/notebook">Details</a></article>' +
  '<article class="item"><h2>Graph pad</h2><p class="price">$25.00</p><time>2026-10-13</time><a href="/pad">Details</a></article>' +
  '</main></body></html>'
const list = { type: 'list', itemSelector: '#chosen .item', fields: [{ name: 'name', selector: 'h2' }, { name: 'price', selector: '.price' }, { name: 'date', selector: 'time' }, { name: 'url', selector: 'a', attribute: 'href' }] }
const scalar = { type: 'json', schema: { type: 'object', properties: { name: { type: 'string' }, price: { type: 'string' } }, required: ['name', 'price'] } }
let server: Server
let origin: string
let root: string
let engine: ApiEngine
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(200).end('User-agent: *\nAllow: /'); return }
    const html = req.url === '/missing' ? HTML.replace('<p class="price">$25.00</p>', '<p class="price"></p>') : req.url === '/zero' ? HTML.replace('$12.00', '$0.00') : HTML
    res.writeHead(200, { 'content-type': 'text/html' }).end(html)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  root = await mkdtemp(join(tmpdir(), 'octocrawl-list-json-'))
  const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
  engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
})
afterAll(async () => {
  await engine.close()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await rm(root, { recursive: true, force: true })
})
async function scrape(formats: unknown[], extra: object = {}) {
  const response = await createApp(engine).request('/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: `${origin}/products`, formats, maxAge: 0, ...extra }) })
  expect(response.status).toBe(200)
  return await response.json() as Record<string, any>
}

describe('JSON and explicit list subject agreement', () => {
  it('does not fill a single-record schema from the off-list product when two records were selected', async () => {
    const out = await scrape(['markdown', list, scalar])
    expect(out.list.records.map((r: any) => r.values.name)).toEqual(['Field notebook', 'Graph pad'])
    expect(out.markdown).toContain('Field notebook')
    expect(out.markdown).not.toContain('Delivery membership')
    expect(out.json.status).toBe('incomplete')
    expect(JSON.stringify(out.json.data)).not.toContain('Delivery membership')
    expect(JSON.stringify(out.json.data)).not.toContain('99.00')
  })

  it('keeps canonical JSON records, dates and source identities aligned with the delivered list', async () => {
    const out = await scrape(['markdown', list, 'json'])
    expect(out.json.status).toBe('complete')
    expect(out.json.data.records).toEqual(out.list.records)
    expect(out.json.data.records.map((r: any) => [r.values.name, r.values.price, r.values.date])).toEqual([
      ['Field notebook', '$12.00', '2026-10-14'], ['Graph pad', '$25.00', '2026-10-13'],
    ])
    expect(out.json.evidence).toHaveLength(8)
    expect(Object.keys(out.evidenceRecord.fieldEvidence)).toHaveLength(8)
    expect(out.json.data.records[0].source).toEqual({ url: `${origin}/products`, page: 1, index: 0 })
  })

  it('maps a single explicitly selected record without reading the page-level product', async () => {
    const out = await scrape(['markdown', { ...list, itemSelector: '#chosen .featured' }, scalar])
    expect(out.json).toMatchObject({ status: 'complete', data: { name: 'Field notebook', price: '$12.00' } })
    expect(out.markdown).not.toContain('Graph pad')
    expect(out.json.evidence.every((field: any) => field.evidencePath.includes('record 0'))).toBe(true)
  })

  it('retains the ordinary page-product behavior when no list was requested', async () => {
    const out = await scrape(['markdown', scalar])
    expect(out.json).toMatchObject({ status: 'complete', data: { name: 'Delivery membership', price: '99' } })
  })

  it('maps a requested array with prices, dates and URLs from each corresponding record', async () => {
    const format = { type: 'json', schema: { type: 'object', properties: { products: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, price: { type: 'number' }, date: { type: 'string' }, url: { type: 'string' } }, required: ['name', 'price', 'date', 'url'] } } }, required: ['products'] } }
    const out = await scrape(['markdown', list, format], { url: `${origin}/zero` })
    expect(out.json).toMatchObject({ status: 'complete', data: { products: [
      { name: 'Field notebook', price: 0, date: '2026-10-14', url: `${origin}/notebook` },
      { name: 'Graph pad', price: 25, date: '2026-10-13', url: `${origin}/pad` },
    ] } })
    expect(out.json.evidence.find((e: any) => e.path === '/products/0/price')).toMatchObject({ source: 'dom', text: '$0.00' })
    expect(out.json.evidence.find((e: any) => e.path === '/products/1/date').evidencePath).toContain('record 1 time text')
  })

  it('retains a missing price as null instead of borrowing a page or neighboring price', async () => {
    const out = await scrape(['markdown', list, 'json'], { url: `${origin}/missing` })
    expect(out.json.status).toBe('incomplete')
    expect(out.json.data.records[1]).toMatchObject({ values: { name: 'Graph pad', price: null }, missing: ['price'] })
    expect(out.json.data.records).toEqual(out.list.records)
    expect(out.json.evidence.some((e: any) => e.path === '/records/1/values/price')).toBe(false)
  })

  it('does not restore explicitly excluded prices into JSON', async () => {
    const out = await scrape(['markdown', list, 'json'], { excludeTags: ['.price'] })
    expect(out.json.status).toBe('incomplete')
    expect(out.json.data.records.every((r: any) => r.values.price === null)).toBe(true)
    expect(out.json.data.records.map((r: any) => r.missing)).toEqual([['price'], ['price']])
    expect(out.json.data.records.every((r: any) => r.source.url === `${origin}/products`)).toBe(true)
  })

  it('keeps original match positions when a preceding record was excluded', async () => {
    const out = await scrape(['markdown', list, 'json'], { excludeTags: ['.featured'] })
    expect(out.json.status).toBe('complete')
    expect(out.json.data.records).toHaveLength(1)
    expect(out.json.data.records[0]).toMatchObject({ values: { name: 'Graph pad' }, source: { index: 1 } })
    expect(out.json.evidence.every((e: any) => e.evidencePath.includes('record 1'))).toBe(true)
  })

  it.each(['batch', 'crawl'] as const)('keeps the selected records aligned on %s pages too', async kind => {
    const app = createApp(engine)
    const path = kind === 'batch' ? '/v1/batches' : '/v1/crawl'
    const response = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(kind === 'batch' ? { urls: [`${origin}/products`] } : { url: `${origin}/products`, maxPages: 1, sitemap: 'skip' }), formats: ['markdown', list, 'json'] }) })
    expect(response.status).toBe(202)
    const { taskId } = await response.json() as { taskId: string }
    let status: string = ''
    for (let i = 0; i < 200; i++) {
      status = ((await (await app.request(`${path}/${taskId}`)).json()) as { status: string }).status
      if (!['pending', 'running'].includes(status)) break
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    expect(status).toBe('completed')
    const { items } = await (await app.request(`${path}/${taskId}/${kind === 'batch' ? 'items' : 'pages'}`)).json() as { items: Record<string, any>[] }
    expect(items[0]!.json.status).toBe('complete')
    expect(items[0]!.json.data.records).toEqual(items[0]!.list.records)
    expect(items[0]!.markdown).not.toContain('Delivery membership')
  })
})
