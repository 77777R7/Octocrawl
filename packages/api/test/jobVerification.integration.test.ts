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

const HTML = '<html><head><title>Tide report</title></head><body><main><article><h1>Tide report</h1>' +
  '<p>The harbour office records tide height, wind and visibility every hour and publishes the complete report each morning. </p>'.repeat(4) +
  '<p>High water at 06:12.</p><a href="/details">Full tide details</a></article></main></body></html>'
let server: Server
let origin: string
let taskRoot: string
const engines: ApiEngine[] = []
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(200).end('User-agent: *\nAllow: /'); return }
    res.writeHead(200, { 'content-type': 'text/html' }).end(HTML)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  taskRoot = await mkdtemp(join(tmpdir(), 'octocrawl-delivered-job-'))
})
afterAll(async () => {
  await Promise.all(engines.map(engine => engine.close()))
  await new Promise<void>(resolve => server.close(() => resolve()))
  await rm(taskRoot, { recursive: true, force: true })
})

async function run(kind: 'batch' | 'crawl', check: object, formats: unknown[] = ['markdown']) {
  const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
  const engine = createApiEngine({ taskRoot: join(taskRoot, String(engines.length)), networkPolicy: policy, channelsFor: mode => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http') })
  engines.push(engine)
  const app = createApp(engine)
  const path = kind === 'batch' ? '/v1/batches' : '/v1/crawl'
  const response = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(kind === 'batch' ? { urls: [`${origin}/article`] } : { url: `${origin}/article`, maxPages: 1, sitemap: 'skip' }), formats, verify: { checks: [check] } }) })
  expect(response.status).toBe(202)
  const accepted = await response.json() as { taskId: string }
  let report: Record<string, any> = {}
  for (let i = 0; i < 200; i++) {
    report = await (await app.request(`${path}/${accepted.taskId}`)).json() as Record<string, any>
    if (!['pending', 'running'].includes(report.status)) break
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  expect(report.status).toBe('completed')
  const itemsPath = `${path}/${accepted.taskId}/${kind === 'batch' ? 'items' : 'pages'}`
  const pages = []
  for (const debug of [false, true]) {
    const listed = await (await app.request(`${itemsPath}?debug=${debug}`)).json() as { items: Record<string, any>[] }
    expect(listed.items).toHaveLength(1)
    pages.push(listed.items[0]!)
  }
  return { report, pages }
}

describe('verification of delivered batch and crawl fields', () => {
  it.each(['batch', 'crawl'] as const)('%s does not pass a field removed from the public page', async kind => {
    const { report, pages } = await run(kind, { type: 'field', path: 'document.title', equals: 'Tide report' })
    for (const page of pages) {
      expect(page).not.toHaveProperty('document')
      expect(page.metadata.title).toBe('Tide report')
      expect(page.verification).toMatchObject({ status: 'failed', checks: [{ passed: false }] })
      expect(page.evidenceRecord.verification.status).toBe('failed')
    }
    expect(report).toMatchObject({ verified: 0, verificationFailed: 1 })
  })

  it.each(['batch', 'crawl'] as const)('%s still passes a field actually delivered on its page', async kind => {
    const { report, pages } = await run(kind, { type: 'field', path: 'metadata.title', equals: 'Tide report' })
    for (const page of pages) {
      expect(page.metadata.title).toBe('Tide report')
      expect(page.verification.status).toBe('passed')
      expect(page.evidenceRecord.verification.status).toBe('passed')
    }
    expect(report).toMatchObject({ verified: 1, verificationFailed: 0 })
  })

  it.each(['batch', 'crawl'] as const)('%s does not verify links kept only for discovery', async kind => {
    const { report, pages } = await run(kind, { type: 'field', path: 'links.0', present: true })
    for (const page of pages) {
      expect(page).not.toHaveProperty('links')
      expect(page.verification.status).toBe('failed')
    }
    expect(report).toMatchObject({ verified: 0, verificationFailed: 1 })
  })

  it.each(['batch', 'crawl'] as const)('%s verifies links when requested and delivered', async kind => {
    const { report, pages } = await run(kind, { type: 'field', path: 'links.0', present: true }, ['markdown', 'links'])
    for (const page of pages) {
      expect(page.links).toContain(`${origin}/details`)
      expect(page.verification.status).toBe('passed')
    }
    expect(report).toMatchObject({ verified: 1, verificationFailed: 0 })
  })
})
