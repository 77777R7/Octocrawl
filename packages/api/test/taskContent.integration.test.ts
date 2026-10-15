import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApiEngine, type ApiEngine } from '../src/engine.js'
import { createApp } from '../src/app.js'

describe('the delivered response of a task-selected list', () => {
  let server: Server
  let url: string
  let root: string
  let engine: ApiEngine
  let app: ReturnType<typeof createApp>
  const list = { type: 'list', itemSelector: 'section#records > .card', fields: [
    { name: 'name', selector: 'a' }, { name: 'url', selector: 'a', attribute: 'href' }, { name: 'price', selector: '.price' },
  ] }

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(`<html><body><article id="intro"><h1>Unrelated introduction</h1>${'<p>This long article explains the catalogue, but is not one of the records requested by the caller.</p>'.repeat(6)}</article><section id="records"><div class="card"><a href="/p/one">First product</a><span class="price">$10.00</span></div><div class="card"><a href="/p/two">Second product</a><span class="price">$20.00</span></div></section></body></html>`)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/catalogue`
    root = await mkdtemp(join(tmpdir(), 'octocrawl-task-content-'))
    engine = createApiEngine({ taskRoot: root })
    app = createApp(engine)
  })
  afterAll(async () => {
    await engine?.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  })

  it('checks and delivers the same selected records, Markdown, HTML and output hashes', async () => {
    const response = await app.request('/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      url, formats: ['markdown', 'html', list], debug: false, maxAge: 0,
      verify: { checks: [{ type: 'recordFields', fields: ['name', 'url', 'price'], min: 2 }, { type: 'markdownIncludes', text: 'First product' }] },
    }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.verification.status).toBe('passed')
    expect(body.list.records.map((record: { values: unknown }) => record.values)).toEqual([
      { name: 'First product', url: new URL('/p/one', url).href, price: '$10.00' },
      { name: 'Second product', url: new URL('/p/two', url).href, price: '$20.00' },
    ])
    expect(body.markdown).toContain('First product')
    expect(body.markdown).not.toContain('Unrelated introduction')
    expect(body.html).not.toContain('Unrelated introduction')
    expect(body.evidenceRecord.rawSha256).toBe(body.snapshot.rawBodySha256)
    expect(body.evidenceRecord.outputSha256.markdown).toBeTruthy()
  })
})
