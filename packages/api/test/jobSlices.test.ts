import { afterEach, describe, expect, it } from 'vitest'
import { cpSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { localNetworkPolicy, parseBatchStartRequest, parseCrawlStartRequest } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { SqliteTaskStore } from '@w2l/runtime'
import { createApiEngine, type ApiEngine, type ApiEngineOptions } from '../src/engine.js'

// Hosted job slices (ROADMAP PH H1, docs/h1-hosted-jobs-tasks.md E4): a stored task runs a slice at a time, each on a
// new engine over a copy of the task's directory, as a slice on another instance would after its checkpoint is restored.

const JOB_ID = '6f1c2a4e-1b2c-4d3e-8f90-0123456789ab'

/** `/` links to /a–/d; each of those links to /deep/<x> and back to `/`. */
function page(path: string): string {
  const links = path === '/' ? ['/a', '/b', '/c', '/d'] : path.startsWith('/deep/') ? [] : [`/deep${path}`, '/']
  return `<!doctype html><html><head><title>Page ${path}</title></head><body><main><article><h1>Page ${path}</h1><p>This is page ${path} of a small slice fixture. It carries enough prose for the extraction cascade to take it as the main content of an article, so every page here is a contentful success.</p><ul>${links.map((href) => `<li><a href="${href}">${href}</a></li>`).join('')}</ul></article></main></body></html>`
}

describe('job slices', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  async function site(options: { gate?: string } = {}) {
    const seen: Array<{ host: string; path: string }> = []
    let release!: () => void
    const released = new Promise<void>((resolve) => { release = resolve })
    const handler = async (req: IncomingMessage, res: ServerResponse) => {
      const path = req.url ?? '/'
      if (path === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
      seen.push({ host: (req.headers.host ?? '').replace(/:\d+$/, ''), path })
      if (path === options.gate) await released
      if (res.destroyed) return
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(path))
    }
    const v4 = createServer(handler)
    await new Promise<void>((resolve) => v4.listen(0, '127.0.0.1', resolve))
    const port = (v4.address() as AddressInfo).port
    const v6 = createServer(handler)
    await new Promise<void>((resolve) => { v6.once('error', () => resolve()); v6.listen(port, '::1', resolve) })
    const roots: string[] = []
    cleanup.push(async () => {
      release()
      for (const server of [v4, v6].filter((s) => s.listening)) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())) }
      for (const root of roots) await rm(root, { recursive: true, force: true })
    })
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    /** A new engine over a new task root holding a copy of the previous root's task directory. */
    const engineAfter = async (previous: string | null, extra: Partial<ApiEngineOptions> = {}): Promise<{ engine: ApiEngine; root: string }> => {
      const root = await mkdtemp(join(tmpdir(), 'w2l-slices-'))
      roots.push(root)
      if (previous !== null) cpSync(join(previous, JOB_ID), join(root, JOB_ID), { recursive: true })
      const engine = createApiEngine({
        taskRoot: root, networkPolicy: policy, workerCount: 2, resumeOnStart: false, deferLaunch: true, taskIds: () => JOB_ID,
        channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy, localSubjects: { browser_local: { fetch: async () => { throw new Error('slice tests stay on HTTP') } } } }),
        ...extra,
      })
      cleanup.push(async () => { await engine.close({ cancelActive: true }) })
      return { engine, root }
    }
    return { origin: `http://127.0.0.1:${port}`, twin: `http://localhost:${port}`, seen, release, engineAfter }
  }

  it('stores a started crawl without running it, then runs it a slice at a time on new engines, each URL fetched once', async () => {
    const { origin, seen, engineAfter } = await site()
    let { engine, root } = await engineAfter(null)
    expect(await engine.startCrawl(parseCrawlStartRequest({ url: `${origin}/`, maxPages: 7 }))).toEqual({ taskId: JOB_ID })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(seen).toEqual([])
    const statuses: string[] = []
    for (let i = 0; i < 6; i++) {
      const slice = await engine.runSlice(JOB_ID, { maxNewPages: 2, maxMs: 30_000 })
      expect(slice).not.toBeNull()
      statuses.push(slice!.status)
      if (slice!.status !== 'paused') break
      await engine.close({ cancelActive: true });
      ({ engine, root } = await engineAfter(root))
    }
    expect(statuses.at(-1)).toBe('completed')
    expect(statuses.slice(0, -1).every((status) => status === 'paused')).toBe(true)
    // Each slice reads the sitemap again: the frontier's queue is not stored, and its entries come back this way.
    const paths = seen.map((request) => request.path).filter((path) => path !== '/sitemap.xml')
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths).toHaveLength(7)
    const store = SqliteTaskStore.openReadOnly(join(root, JOB_ID))
    try { expect(await store.countCompletedSteps(JOB_ID)).toBe(7) } finally { await store.close() }
  })

  it('runs a two-host batch one host per slice with batchHosts, pausing until the last host is read', async () => {
    const { origin, twin, seen, engineAfter } = await site()
    let { engine, root } = await engineAfter(null)
    await engine.startBatch(parseBatchStartRequest({ urls: [`${origin}/a`, `${twin}/b`, `${origin}/c`] }))
    const first = await engine.runSlice(JOB_ID, { maxNewPages: 100, maxMs: 30_000, batchHosts: ['127.0.0.1'] })
    expect(first?.status).toBe('paused')
    expect(seen.map((request) => `${request.host}${request.path}`).sort()).toEqual(['127.0.0.1/a', '127.0.0.1/c'])
    await engine.close({ cancelActive: true });
    ({ engine, root } = await engineAfter(root))
    const second = await engine.runSlice(JOB_ID, { maxNewPages: 100, maxMs: 30_000, batchHosts: ['localhost'] })
    expect(second?.status).toBe('completed')
    expect(seen.map((request) => `${request.host}${request.path}`).sort()).toEqual(['127.0.0.1/a', '127.0.0.1/c', 'localhost/b'])
  })

  it('runs nothing for URLs appended to a deferred batch until the next slice, which reads them', async () => {
    const { origin, seen, engineAfter } = await site()
    const { engine } = await engineAfter(null)
    await engine.startBatch(parseBatchStartRequest({ urls: [`${origin}/a`] }))
    expect((await engine.runSlice(JOB_ID, { maxNewPages: 100, maxMs: 30_000 }))?.status).toBe('completed')
    await engine.startBatch(parseBatchStartRequest({ appendToId: JOB_ID, urls: [`${origin}/b`] }))
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(seen.map((request) => request.path)).toEqual(['/a'])
    expect((await engine.runSlice(JOB_ID, { maxNewPages: 100, maxMs: 30_000 }))?.status).toBe('completed')
    expect(seen.map((request) => request.path)).toEqual(['/a', '/b'])
  })

  it('completes rather than pauses when the slice reaches its page limit on the last page', async () => {
    const { origin, engineAfter } = await site()
    const { engine } = await engineAfter(null)
    await engine.startBatch(parseBatchStartRequest({ urls: [`${origin}/a`, `${origin}/b`] }))
    expect(await engine.runSlice(JOB_ID, { maxNewPages: 2, maxMs: 30_000 })).toMatchObject({ status: 'completed', newPages: 2 })
  })

  it('pauses a slice at its time limit while a page hangs, and runs nothing for a task cancelled between slices', async () => {
    const { origin, release, engineAfter } = await site({ gate: '/' })
    let { engine, root } = await engineAfter(null)
    await engine.startCrawl(parseCrawlStartRequest({ url: `${origin}/`, maxPages: 5 }))
    const began = Date.now()
    const slice = await engine.runSlice(JOB_ID, { maxNewPages: 100, maxMs: 300, graceMs: 200 })
    expect(slice?.status).toBe('paused')
    expect(Date.now() - began).toBeLessThan(5_000)
    release()
    await engine.close({ cancelActive: true });
    ({ engine, root } = await engineAfter(root))
    const store = SqliteTaskStore.open(join(root, JOB_ID))
    try { await store.putTask({ ...(await store.getTask(JOB_ID))!, status: 'cancelled' }) } finally { await store.close() }
    expect(await engine.runSlice(JOB_ID, { maxNewPages: 100, maxMs: 30_000 })).toMatchObject({ status: 'cancelled', newPages: 0 })
    expect(await engine.runSlice('6f1c2a4e-0000-4d3e-8f90-0123456789ab', { maxNewPages: 1, maxMs: 1_000 })).toBeNull()
  })
})
