import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localNetworkPolicy } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/**
 * ROADMAP PA item 3: a list task that fails at page N resumes there with no lost or duplicated records. A batch
 * whose paginate step is cut by shutdown at page N keeps the pages it read in the task's checkpoint; the batch
 * resumes on the next start, passes over those pages on its way to page N+1 and merges every page once.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(2)
const card = (n: number) => `<div class="card"><a class="name" href="/p/${n}">Item ${n}</a><span class="price">${n}.00</span></div>`
const LIST = { type: 'list', itemSelector: 'div.card', fields: [{ name: 'name', selector: 'a.name' }, { name: 'price', selector: '.price' }] }
let server: Server
let origin: string
const hits: string[] = []
// Page 3's answer waits here until the test lets it go.
let holdThird = false
let thirdStarted: (() => void) | null = null
const held: (() => void)[] = []
let root: string
let engine: ApiEngine | null = null

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? ''
    hits.push(url)
    if (url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
    const page = /^\/pages\/(\d)$/.exec(url)
    if (page === null) return void res.writeHead(404).end()
    const n = Number(page[1])
    const answer = () => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Catalogue ${n}</title></head><body><p>${PROSE}</p>${[1, 2, 3].map((i) => card(n * 10 + i)).join('')}${n < 3 ? `<a class="next" href="/pages/${n + 1}">Next</a>` : ''}</body></html>`)
    if (n === 3 && holdThird) { thirdStarted?.(); held.push(answer); return }
    answer()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await engine?.close()
  engine = null
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('a batch list task cut at page N', () => {
  it('resumes from the pages it read, reads the rest once and merges every page once', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-list-resume-'))
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const make = () => createApiEngine({ taskRoot: join(root, 'tasks'), networkPolicy: policy, channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy }).filter((channel) => channel.id === 'browser_local') })
    holdThird = true
    const started = new Promise<void>((resolve) => { thirdStarted = resolve })
    const first = make()
    const { taskId } = await first.startBatch({ urls: [`${origin}/pages/1`], formats: ['markdown', LIST], actions: [{ type: 'paginate', nextSelector: 'a.next', itemSelector: 'div.card', waitMs: 200 }], timeout: 60_000 } as Parameters<ApiEngine['startBatch']>[0])
    // Pages 1 and 2 are read; the click to page 3 waits on the server. Shutdown cuts the URL there.
    await started
    await first.close({ cancelActive: true })
    expect((await first.getBatch(taskId))?.status).toBe('paused')
    holdThird = false
    for (const answer of held.splice(0)) answer()
    const before = hits.filter((hit) => hit === '/pages/1').length

    engine = make()
    let report = await engine.getBatch(taskId)
    for (let i = 0; i < 600 && (report === null || ['pending', 'running', 'paused'].includes(report.status)); i++) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      report = await engine.getBatch(taskId)
    }
    expect(report).toMatchObject({ status: 'completed', completed: 1, succeeded: 1 })
    const items = (await engine.getBatchItems(taskId, { limit: 10, debug: true }))!.items as unknown as { status: string; list?: { pages: number; records: { values: Record<string, string | null>; source: { page: number } }[] }; actions?: { lists: Record<string, unknown>[] }; trace?: { event: string; detail?: Record<string, unknown> }[] }[]
    expect(items).toHaveLength(1)
    const item = items[0]!
    expect(item.status).toBe('success')
    // Pages 1 and 2 from the checkpoint, page 3 read now: nine records, each page once.
    expect(item.list).toMatchObject({ pages: 3 })
    expect(item.list?.records.map((record) => record.values.name)).toEqual([11, 12, 13, 21, 22, 23, 31, 32, 33].map((n) => `Item ${n}`))
    expect(item.list?.records.map((record) => record.source.page)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3])
    expect(item.actions?.lists[0]).toMatchObject({ type: 'paginate', stoppedBy: 'end', rounds: 3, resumed: 2 })
    expect(item.trace?.find((event) => event.event === 'list_resumed')?.detail).toMatchObject({ step: 0, pages: 2, replayed: 2 })
    // The way to page 3 is the site's own Next links, so page 1 was requested again on the resume: the records are not.
    expect(hits.filter((hit) => hit === '/pages/1').length).toBe(before + 1)
  }, 180_000)
})
