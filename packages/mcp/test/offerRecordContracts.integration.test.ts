import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createApiEngine, createApp, type ApiEngine } from '@w2l/api'
import { localNetworkPolicy, parseScrapeRequest, type CompactScrapeResponse } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from '../src/server.js'

const load = async (file: string) => parseScrapeRequest(JSON.parse(await readFile(new URL(`../../../examples/contracts/${file}.json`, import.meta.url), 'utf8')))
const requests = { newegg: await load('newegg-laptops'), skyscanner: await load('skyscanner-london-paris') }
const frozen = JSON.parse(await readFile(new URL('../../../research/access/tasks.v1.json', import.meta.url), 'utf8')) as { tasks: Array<{ id: string; predicates: NonNullable<ReturnType<typeof parseScrapeRequest>['verify']>['checks'] }> }
type Site = keyof typeof requests

// Synthetic records model only the selectors inspected in retained source HTML; none are real offers.
function card(site: Site, i: number): string {
  return site === 'newegg'
    ? `<div class="goods-container" data-itemnumber="sku-${i}"><a class="goods-title" href="/product/${i}">Synthetic laptop ${i}</a><div class="goods-price-current">$${i === 0 ? '0' : 100 + i}.00</div></div>`
    : `<a data-testid="dealCard_${i}" href="/transport/flights/LHR/CDG/2027010${i + 1}"><div class="Flight_Flight__${i === 2 ? 'defaultIcon' : 'flightProviderImage'}__fixture">${i === 2 ? '<svg alt="Synthetic Air"></svg>' : '<img alt="Synthetic Air">'}</div><div class="Flight_Flight__flightInfo__fixture"><span data-testid="deal-leg-date">Thu, ${i + 1} Jan</span><span>LHR - CDG with Synthetic Air</span></div><div class="PriceButton_PriceButton__button__fixture"><span>from £${20 + i}</span></div></a>`
}
function fixture(site: Site, kind: string): string {
  let cards = [0, 1, 2].map(i => card(site, i))
  if (kind === 'duplicates') cards = Array(3).fill(cards[0]!)
  if (site === 'newegg') {
    if (kind === 'missing-name') cards[0] = cards[0]!.replace('Synthetic laptop 0', '')
    if (kind === 'missing-price') cards[0] = cards[0]!.replace('$0.00', '')
    if (kind === 'missing-url') cards[0] = cards[0]!.replace(' href="/product/0"', '')
    if (kind === 'missing-id') cards[0] = cards[0]!.replace('sku-0', ' ')
    if (kind === 'split-fields') cards = cards.map((c, i) => i === 0 ? c.replace('$0.00', '') : c.replace(`Synthetic laptop ${i}`, ''))
    if (kind === 'incomplete-duplicates') cards = [cards[0]!.replace('$0.00', ''), cards[0]!.replace('Synthetic laptop 0', ''), cards[0]!.replace('$0.00', '')]
    if (kind === 'extra-incomplete') cards.push(card(site, 3).replace('$103.00', ''))
  } else {
    if (kind === 'missing-date') cards[0] = cards[0]!.replace('<span data-testid="deal-leg-date">Thu, 1 Jan</span>', '')
    if (kind === 'missing-carrier') cards[0] = cards[0]!.replace(' alt="Synthetic Air"', '')
    if (kind === 'missing-route') cards[0] = cards[0]!.replace('<span>LHR - CDG with Synthetic Air</span>', '')
    if (kind === 'missing-price') cards[0] = cards[0]!.replace('from £20', '')
    if (kind === 'missing-url') cards[0] = cards[0]!.replace(' href="/transport/flights/LHR/CDG/20270101"', '')
    if (kind === 'split-fields') cards = cards.map((c, i) => i === 0 ? c.replace('<span data-testid="deal-leg-date">Thu, 1 Jan</span>', '') : c.replace(' alt="Synthetic Air"', ''))
    if (kind === 'extra-incomplete') cards.push(card(site, 3).replace(' alt="Synthetic Air"', ''))
  }
  const title = kind === 'wrong-subject' ? 'Different task' : site === 'newegg' ? 'Laptops and Notebooks Computers' : 'Cheap Flights from London (LOND) to Paris (PARI) | Skyscanner'
  // These prices, date and carrier must never rescue a missing field on a selected record.
  const decoy = '<nav>laptop Paris $10 $20 $30 Thu, 1 Jan Synthetic Air</nav>'
  const region = site === 'newegg' ? 'div class="plp-results-section"' : 'main'
  const close = site === 'newegg' ? 'div' : 'main'
  const selected = ['navigation-only', 'outside'].includes(kind) ? '' : cards.join('')
  const outside = kind === 'outside' ? `<aside>${cards.join('')}</aside>` : ''
  return `<html><head><title>${title}</title></head><body>${decoy}<${region}><h1>${site === 'newegg' ? 'Laptop catalog' : 'London to Paris'}</h1>${selected}</${close}>${outside}</body></html>`
}

describe('explicit Newegg and Skyscanner same-record contracts through HTTP, SDK and MCP', () => {
  let source: Server
  let api: Server
  let engine: ApiEngine
  let root: string
  let origin: string
  let sdk: W2L
  let mcp: Client
  let structured: boolean
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'octocrawl-offer-contracts-'))
    source = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(404).end(); return }
      const [site, kind] = new URL(req.url!, 'http://fixture').pathname.slice(1).split('/')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fixture(site as Site, kind!))
    })
    await new Promise<void>(resolve => source.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(source.address() as AddressInfo).port}`
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({ taskRoot: root, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
    api = serve({ fetch: createApp(engine).fetch, hostname: '127.0.0.1', port: 0 }) as Server
    if (!api.listening) await new Promise<void>(resolve => api.once('listening', resolve))
    sdk = new W2L({ baseUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}` })
    mcp = new Client({ name: 'octocrawl-offer-contract-test', version: '1.0.0' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([createMcpServer(sdk).connect(serverSide), mcp.connect(clientSide)])
    structured = (await mcp.listTools()).tools.some(tool => tool.name === 'scrape' && tool.outputSchema !== undefined)
  })
  afterAll(async () => {
    await mcp?.close()
    await engine?.close()
    await Promise.all([api, source].filter(Boolean).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
    if (root) await rm(root, { recursive: true, force: true })
  })

  for (const site of ['newegg', 'skyscanner'] as const) for (const surface of ['SDK', 'MCP'] as const) for (const debug of [false, true]) {
    async function scrape(kind: string, weak = false): Promise<CompactScrapeResponse> {
      const url = `${origin}/${site}/${kind}`
      const predicates = frozen.tasks.find(t => t.id === (site === 'newegg' ? 'T020' : 'T039'))!.predicates
      const args = { ...requests[site], url, debug, fastMode: true, formats: [...requests[site].formats!, 'rawHtml' as const], ...(weak ? { includeTags: ['body'], formats: ['markdown', 'rawHtml'] as const, verify: { checks: predicates } } : {}) }
      let out: CompactScrapeResponse
      if (surface === 'SDK') out = JSON.parse(JSON.stringify(await sdk.scrape(url, args))) as CompactScrapeResponse
      else {
        const response = await mcp.callTool({ name: 'scrape', arguments: args })
        expect(response.isError).not.toBe(true)
        out = JSON.parse((response.content as Array<{ type: string; text: string }>).find(block => block.type === 'text')!.text) as CompactScrapeResponse
        if (structured) expect(response.structuredContent).toEqual(out)
        else expect(response.structuredContent).toBeUndefined()
      }
      expect(out.evidenceRecord.verification?.status).toBe(out.verification.status)
      expect(out.evidenceRecord.readiness?.state).toBe(out.readiness.state)
      expect(out.evidenceRecord.readiness?.basis).toEqual(out.readiness.basis)
      expect(out.snapshot.rawBodySha256).toBe(createHash('sha256').update(fixture(site, kind)).digest('hex'))
      expect(out.evidenceRecord.rawSha256).toBe(out.snapshot.rawBodySha256)
      return out
    }
    const label = `${site} ${surface} ${debug ? 'full' : 'compact'}`
    it(`${label} passes three complete identities, retains source values and JSON locators`, async () => {
      const out = await scrape('valid')
      expect(out.verification).toMatchObject({ status: 'passed', checks: [{ passed: true }, { observedCount: 3, asked: 3 }] })
      expect(out.readiness.state).toBe('ready')
      expect(out.list?.records).toHaveLength(3)
      expect(out.list?.records.every(r => r.missing.length === 0)).toBe(true)
      expect(out.json?.status).toBe('complete')
      expect(out.json?.data).toEqual({ records: out.list?.records })
      const fields = site === 'newegg' ? ['sku', 'name', 'url', 'price'] : ['url', 'departureDate', 'carrier', 'route', 'priceFrom']
      for (const [i, record] of out.list!.records.entries()) {
        expect(record.source).toMatchObject({ index: i, page: 1 })
        expect(record.values.url).toMatch(new RegExp(`^${origin}/`))
        for (const field of fields) expect(out.json?.evidence).toContainEqual(expect.objectContaining({ path: `/records/${i}/values/${field}`, source: 'dom', evidencePath: expect.stringContaining(`record ${i} `) }))
      }
      if (site === 'newegg') expect(out.list?.records[0]?.values.price).toBe('$0.00')
      else expect(out.list?.records[2]?.values.carrier).toBe('Synthetic Air') // SVG alt, no airline logo image.
    })
    it(`${label} rejects navigation prices and incomplete records that pass frozen weak predicates`, async () => {
      for (const kind of ['navigation-only', 'split-fields', ...(site === 'skyscanner' ? ['missing-date', 'missing-carrier'] : [])]) {
        const weak = await scrape(kind, true)
        expect(weak.verification.status, kind).toBe('passed')
        const strong = await scrape(kind)
        expect(strong.verification.status, kind).toBe('failed')
        expect(strong.readiness.state, kind).not.toBe('ready')
        expect(strong.rawHtml).toBe(weak.rawHtml)
      }
    })
    it(`${label} rejects missing fields, duplicate identities, outside records and wrong subject`, async () => {
      const missing = site === 'newegg' ? ['missing-name', 'missing-price', 'missing-url', 'missing-id', 'incomplete-duplicates'] : ['missing-date', 'missing-carrier', 'missing-route', 'missing-price', 'missing-url']
      for (const kind of [...missing, 'duplicates', 'outside', 'wrong-subject']) {
        const out = await scrape(kind)
        expect(out.verification.status, kind).toBe('failed')
        expect(out.readiness.state, kind).not.toBe('ready')
        if (kind === 'duplicates') {
          expect(out.list?.records).toHaveLength(3)
          expect(out.verification).toMatchObject({ checks: [{}, { observedCount: 1 }] })
        }
        if (kind === 'missing-date') {
          expect(out.list?.records[0]?.values.departureDate).toBeNull()
          expect(out.list?.records[0]?.values.route).toBe('LHR - CDG with Synthetic Air')
        }
        if (kind === 'missing-carrier') {
          expect(out.list?.records[0]?.values.carrier).toBeNull()
          expect(out.list?.records[0]?.values.route).toContain('Synthetic Air')
        }
      }
    })
    it(`${label} counts three complete records while retaining an extra incomplete record`, async () => {
      const out = await scrape('extra-incomplete')
      expect(out.verification).toMatchObject({ status: 'passed', checks: [{}, { observedCount: 3 }] })
      expect(out.list?.records).toHaveLength(4)
      expect(out.list?.records[3]?.missing).toContain(site === 'newegg' ? 'price' : 'carrier')
      expect(out.json?.status).toBe('incomplete')
      expect(out.json?.data).toEqual({ records: out.list?.records })
    })
  }
})
