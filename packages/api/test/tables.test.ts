import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { localNetworkPolicy, type CrawlPage, type NetworkPolicy, type PageTable } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { sha256Utf8 } from '@w2l/http-core'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/**
 * The `tables` format through the API on the http rung: one entry per GFM
 * table of the Markdown, as rows and CSV, on scrape (full and compact) and
 * batch items, and only when asked for.
 */
const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning. '.repeat(3)
const PAGE = '<!doctype html><html lang="en"><head><title>Tides</title></head><body><nav><a href="/">Home</a></nav><main><article><h1>Tide tables</h1>' +
  `<p>${PROSE}</p>` +
  '<table><caption>High water, metres</caption><thead><tr><th>Date</th><th>Station</th><th>Height</th></tr></thead>' +
  '<tbody><tr><td rowspan="2">2026-10-01</td><td>North pier</td><td>4.2</td></tr><tr><td>South, "outer" pier</td><td>3.9</td></tr></tbody></table>' +
  `<p>${PROSE}</p>` +
  '<table><tr><td>Wind</td><td><a href="/wind">12 kn</a></td></tr><tr><td>Visibility</td><td>Good</td></tr></table>' +
  '</article></main><footer><table><tr><td>Footer</td><td>x</td></tr><tr><td>Links</td><td>y</td></tr></table></footer></body></html>'

let server: Server
let origin: string
let taskRoot: string
let engine: ApiEngine
const policy: NetworkPolicy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  taskRoot = await mkdtemp(join(tmpdir(), 'w2l-tables-'))
  engine = createApiEngine({ taskRoot, networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
})

afterAll(async () => {
  await engine.close()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await rm(taskRoot, { recursive: true, force: true })
})

type Json = Record<string, any>
async function post(path: string, body: Json): Promise<Json> {
  const res = await createApp(engine).request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  expect(res.status).toBe(path === '/v1/scrape' ? 200 : 202)
  return await res.json() as Json
}

const gfmTables = (markdown: string): number => markdown.split('\n').filter((line) => /^\| (---( \| ---)*) \|$/.test(line)).length

describe('tables format', () => {
  it('gives each GFM table of the Markdown as rows and RFC 4180 CSV, with its index, caption, source and hash', async () => {
    const url = `${origin}/tides`
    const full = await post('/v1/scrape', { url, formats: ['markdown', 'tables'] })
    const tables = full.tables as PageTable[]
    expect(tables).toHaveLength(gfmTables(full.markdown))
    expect(tables[0]).toEqual({
      tableIndex: 0, caption: 'High water, metres', sourceUrl: url, headerRows: 1, columns: 3,
      rows: [['Date', 'Station', 'Height'], ['2026-10-01', 'North pier', '4.2'], ['2026-10-01', 'South, "outer" pier', '3.9']],
      csv: 'Date,Station,Height\r\n2026-10-01,North pier,4.2\r\n2026-10-01,"South, ""outer"" pier",3.9\r\n',
      csvSha256: sha256Utf8('Date,Station,Height\r\n2026-10-01,North pier,4.2\r\n2026-10-01,"South, ""outer"" pier",3.9\r\n'),
    })
    expect(tables[1]).toMatchObject({ tableIndex: 1, caption: null, headerRows: 0, rows: [['Wind', '12 kn'], ['Visibility', 'Good']] })
    expect(full.trace.some((event: { event: string }) => event.event === 'tables_extracted')).toBe(true)

    // The compact shape names the format and carries the same tables; the whole page adds the footer's table, as its Markdown does.
    const compact = await post('/v1/scrape', { url, formats: ['tables'], debug: false })
    expect(compact.formats).toEqual(['tables'])
    expect(compact.tables).toEqual(tables)
    const whole = await post('/v1/scrape', { url, formats: ['markdown', 'tables'], onlyMainContent: false })
    expect(whole.tables).toHaveLength(gfmTables(whole.markdown))
    expect(whole.tables.at(-1).rows).toEqual([['Footer', 'x'], ['Links', 'y']])

    const plain = await post('/v1/scrape', { url })
    expect(plain).not.toHaveProperty('tables')
  })

  it('carries the tables on batch items when the batch asks for them', async () => {
    const batch = await post('/v1/batches', { urls: [`${origin}/a`, `${origin}/b`], formats: ['tables'] })
    let items: readonly CrawlPage[] = []
    for (let i = 0; i < 200; i++) {
      const status = await engine.getBatch(batch.taskId)
      if (status !== null && status.status === 'completed') { items = (await engine.getBatchItems(batch.taskId, { limit: 10 }))!.items; break }
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    expect(items).toHaveLength(2)
    for (const item of items) expect(item.tables?.map((table) => table.tableIndex)).toEqual([0, 1])
  })
})
