import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { localNetworkPolicy, parseBatchStartRequest } from '@w2l/contracts'
import { SqliteTaskStore } from '@w2l/runtime'
import { buildChannels } from '@w2l/bench'
import { W2L, type BatchAccepted } from '@w2l/sdk'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine, type ApiEngineOptions } from '../src/engine.js'
import { markdownFileName, RESULT_FILE_COLUMNS } from '../src/resultFiles.js'

describe('persistent URL-array batch', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  async function fixture(options: { maxActiveBatches?: number; perHostConcurrency?: number } = {}) {
    const { perHostConcurrency = 1, ...engineOptions } = options
    const root = await mkdtemp(join(tmpdir(), 'w2l-batch-'))
    let slow = false
    let release = () => {}
    let slowStarted = () => {}
    // Page requests being answered right now and the most there ever were at once; `hold` may keep an answer back (the concurrency tests).
    let inFlight = 0
    let maxInFlight = 0
    let hold: (path: string) => Promise<void> = async () => {}
    const seen: string[] = []
    const movedOnce = new Set<string>()
    const server = createServer(async (req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(200).end('User-agent: *\nDisallow: /private\nAllow: /'); return }
      const path = req.url ?? ''
      seen.push(path)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        if (path.endsWith('/item/2') && slow) {
          slowStarted()
          await new Promise<void>(resolve => { release = resolve })
        }
        await hold(path)
        if (res.destroyed) return
        // A page the server says has no content: a bare 204, no body and no content-type header.
        if (path.startsWith('/empty/')) { res.writeHead(204).end(); return }
        // A detail page the site sends to its home page with a 302, as www.english.ids-cologne.de did for 98 of 272 exhibitor pages (2026-11-04).
        if (path.startsWith('/moved/')) { res.writeHead(302, { location: '/' }).end(); return }
        // A page the site sends away once, as a limit on rate does, and serves when it is asked again.
        if (path.startsWith('/once-moved/') && !movedOnce.has(path)) { movedOnce.add(path); res.writeHead(302, { location: '/' }).end(); return }
        if (path.startsWith('/missing/')) {
          res.writeHead(404, { 'content-type': 'text/html' })
          res.end('<html><head><title>Not Found</title></head><body><main><h1>Not Found</h1><p>There is no such item on this fixture server; the page you asked for does not exist here and never did, so this answer is the error page itself.</p></main></body></html>')
          return
        }
        const number = path.split('/').at(-1) ?? '0'
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end(`<html><head><title>Fixture item ${number}</title></head><body><main><article><h1>Fixture item ${number}</h1><p>This is a long and stable product page for item ${number}. It has enough independent body text for the extraction cascade to accept it as a real article, and it provides a deterministic title to map directly into the requested JSON schema.</p><p><a href="details">Details</a></p></article></main></body></html>`)
      } finally { inFlight-- }
    })
    // Bound to 127.0.0.1 and to ::1 on the same port, so the one server answers as 127.0.0.1 and, for a URL appended on a new
    // host, as localhost (::1 first). Not listen(0) on every address: macOS may hand a dual-stack listener a port another
    // process holds on 0.0.0.0, and that process then answers 127.0.0.1 (a reset, its own page, or nothing the test waits for).
    const loopback6 = createServer((req, res) => server.emit('request', req, res))
    const listen = (target: Server, port: number, host: string) => new Promise<void>((resolve, reject) => {
      target.once('error', reject)
      target.listen(port, host, () => { target.off('error', reject); resolve() })
    })
    for (let attempt = 1; ; attempt++) {
      await listen(server, 0, '127.0.0.1')
      try { await listen(loopback6, (server.address() as AddressInfo).port, '::1'); break } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        // A host without IPv6 keeps the 127.0.0.1 listener alone, all that listen(0) gave there too.
        if (code === 'EADDRNOTAVAIL' || code === 'EAFNOSUPPORT') break
        // Another process has that port on ::1: take a new one.
        await new Promise<void>(resolve => server.close(() => resolve()))
        if (code !== 'EADDRINUSE' || attempt === 5) throw error
      }
    }
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const localhostOrigin = `http://localhost:${(server.address() as AddressInfo).port}`
    const engine = (extra: Partial<ApiEngineOptions> = {}) => createApiEngine({ taskRoot: root, networkPolicy: { ...localNetworkPolicy(), perHostConcurrency, perHostMinDelayMs: 0 }, workerCount: 2, ...engineOptions, ...extra })
    cleanup.push(async () => {
      release()
      for (const listener of [server, loopback6]) {
        listener.closeAllConnections()
        if (listener.listening) await new Promise<void>(resolve => listener.close(() => resolve()))
      }
      await rm(root, { recursive: true, force: true })
    })
    return {
      origin, localhostOrigin, root, engine, seen, setSlow: (value: boolean) => { slow = value }, setStarted: (fn: () => void) => { slowStarted = fn }, release: () => release(),
      setHold: (fn: (path: string) => Promise<void>) => { hold = fn }, inFlight: () => inFlight, maxInFlight: () => maxInFlight, resetMaxInFlight: () => { maxInFlight = 0 },
    }
  }

  const client = (engine: ApiEngine) => {
    const app = createApp(engine)
    return { app, client: new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app.request(String(input), init)) as typeof fetch }) }
  }

  it('runs at most maxConcurrency pages at once, reports the cap in force and stores it with the task', async () => {
    const f = await fixture({ perHostConcurrency: 2 })
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const urls = [1, 2, 3, 4].map(n => `${f.origin}/item/${n}`)
    // A host's first page runs alone until its robots.txt verdict is known (the frontier's rule). From the second request on an
    // answer waits until two requests are in flight, so overlap is proven by arrival, not by timing; the batch's last request
    // answers alone, since nothing can join it.
    const waiting: Array<() => void> = []
    const releaseWaiting = () => { while (waiting.length > 0) waiting.shift()!() }
    f.setHold(async () => {
      if (f.seen.length === 1 || f.seen.length === urls.length || f.inFlight() >= 2) { releaseWaiting(); return }
      await new Promise<void>(resolve => waiting.push(resolve))
    })
    const wide = await w2l.batchScrape(urls)
    expect(await w2l.waitBatch(wide.taskId)).toMatchObject({ status: 'completed', completed: 4, maxConcurrency: 2 })
    expect(f.maxInFlight()).toBe(2)
    // Under maxConcurrency 1 each answer is held 100 ms instead: a correct cap sends the next request only after this one is
    // answered, whatever the load, while a broken cap would have the second request arrive within the hold on loopback.
    f.resetMaxInFlight()
    f.setHold(() => new Promise(resolve => setTimeout(resolve, 100)))
    const capped = await w2l.batchScrape(urls, { maxConcurrency: 1 })
    expect(await w2l.waitBatch(capped.taskId)).toMatchObject({ status: 'completed', completed: 4, maxConcurrency: 1 })
    expect(f.maxInFlight()).toBe(1)
    const store = SqliteTaskStore.openReadOnly(join(f.root, capped.taskId))
    try { expect((await store.getTask(capped.taskId))?.batch).toMatchObject({ maxConcurrency: 1 }) } finally { await store.close() }
    // The cap only lowers the service's worker count (2 here): asking for 4 runs under, and reports, 2.
    expect(await w2l.getBatch((await w2l.batchScrape([urls[0]!], { maxConcurrency: 4 })).taskId)).toMatchObject({ maxConcurrency: 2 })
    expect(await w2l.getBatch(wide.taskId)).not.toHaveProperty('invalidURLs')
  })

  it('takes a maxConcurrency above four where the service has the workers, and reports the cap in force', async () => {
    // The request's ceiling is the service's worker count (W2L_WORKER_COUNT, up to 64), not a fixed four (docs/launch/2026-11-05-batch-concurrency-plan.md D4);
    // per host the lower of it and the per-host ceiling still applies.
    const f = await fixture({ perHostConcurrency: 2 })
    const engine = f.engine({ workerCount: 6 })
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const urls = [1, 2, 3, 4, 5, 6].map(n => `${f.origin}/item/${n}`)
    const six = await w2l.batchScrape(urls, { maxConcurrency: 6 })
    expect(await w2l.waitBatch(six.taskId)).toMatchObject({ status: 'completed', completed: 6, maxConcurrency: 6 })
    const store = SqliteTaskStore.openReadOnly(join(f.root, six.taskId))
    try { expect((await store.getTask(six.taskId))?.batch).toMatchObject({ maxConcurrency: 6 }) } finally { await store.close() }
    // Above the worker count it is lowered, and the cap in force is what the status reports.
    expect(await w2l.getBatch((await w2l.batchScrape([urls[0]!], { maxConcurrency: 8 })).taskId)).toMatchObject({ maxConcurrency: 6 })
  })

  it('keeps the batch\'s maxConcurrency when an interrupted batch resumes', async () => {
    const f = await fixture({ perHostConcurrency: 2 })
    f.setSlow(true)
    let started!: () => void
    const slowStarted = new Promise<void>(resolve => { started = resolve })
    f.setStarted(started)
    const engine1 = f.engine()
    const urls = [1, 2, 3, 4].map(n => `${f.origin}/item/${n}`)
    const { taskId } = await engine1.startBatch({ urls, maxConcurrency: 1 })
    await slowStarted
    await engine1.close({ cancelActive: true })
    expect(await engine1.getBatch(taskId)).toMatchObject({ status: 'paused', completed: 1, maxConcurrency: 1 })
    f.setSlow(false); f.release()
    // The fixture is still answering the request engine1 abandoned; let it drain before counting the resumed run's requests.
    while (f.inFlight() > 0) await new Promise(resolve => setTimeout(resolve, 10))
    f.resetMaxInFlight()
    f.setHold(() => new Promise(resolve => setTimeout(resolve, 100)))
    const engine2 = f.engine()
    cleanup.push(() => engine2.close())
    expect(await client(engine2).client.waitBatch(taskId)).toMatchObject({ status: 'completed', requested: 4, completed: 4, remaining: 0, maxConcurrency: 1 })
    // The resumed run fetched the three missing pages one at a time, under the cap stored with the task.
    expect(f.maxInFlight()).toBe(1)
    expect(f.seen.filter(path => path === '/item/1')).toHaveLength(1)
    expect(f.seen.filter(path => path === '/item/2')).toHaveLength(2)
  })

  it('starts with the valid URLs when ignoreInvalidURLs is on and keeps the skipped entries on the record', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { app, client: w2l } = client(engine)
    const urls = [`${f.origin}/item/1`, 'not a url', 'ftp://x']
    const accepted = await w2l.batchScrape(urls, { ignoreInvalidURLs: true })
    expect(accepted).toEqual({ taskId: expect.any(String), invalidURLs: ['not a url', 'ftp://x'] })
    expect(await w2l.waitBatch(accepted.taskId)).toMatchObject({ status: 'completed', requested: 1, completed: 1, remaining: 0, invalidURLs: ['not a url', 'ftp://x'] })
    expect((await w2l.getBatchItems(accepted.taskId)).items.map(item => [item.url, item.status])).toEqual([[urls[0], 'success']])
    // Without the option the same body is refused by the entry's index, and no task directory appears.
    const before = (await readdir(f.root)).length
    const refused = await app.request('http://w2l.test/v1/batches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls }) })
    expect(refused.status).toBe(400)
    expect(await refused.json()).toEqual({ error: 'urls[1] must be http(s)', code: 'invalid_request' })
    expect((await readdir(f.root)).length).toBe(before)
    expect(f.seen).toEqual(['/item/1'])
  })

  /** The task directories under a root: the batches and crawls, not the task root's own files (the idempotency index, scrapes). */
  const taskDirs = async (root: string) => (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory() && !['scrapes', 'files', 'profiles'].includes(entry.name)).map(entry => entry.name).sort()

  it('replays a batch submitted twice under one idempotency key, refuses the key for another request, and reads the key from the header too', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { app, client: w2l } = client(engine)
    const urls = [1, 2, 3].map(n => `${f.origin}/item/${n}`)
    const first = await w2l.batchScrape(urls, { idempotencyKey: 'nightly-2026-10-02' })
    const again = await w2l.batchScrape(urls, { idempotencyKey: 'nightly-2026-10-02' })
    expect(first).toEqual({ taskId: expect.any(String) })
    expect(again).toEqual({ taskId: first.taskId, replayed: true })
    expect(await w2l.waitBatch(first.taskId)).toMatchObject({ status: 'completed', requested: 3, completed: 3 })
    // One task directory, each URL fetched once; the key's row sits in the task root's index.
    expect(await taskDirs(f.root)).toEqual([first.taskId])
    expect([...f.seen].sort()).toEqual(['/item/1', '/item/2', '/item/3'])
    expect((await readdir(f.root)).some(name => name === 'idempotency.sqlite')).toBe(true)
    // The same key with another request is a conflict, and starts nothing either.
    await expect(w2l.batchScrape(urls.slice(0, 2), { idempotencyKey: 'nightly-2026-10-02' })).rejects.toMatchObject({ status: 409, code: 'conflict', body: { error: 'idempotency key was used for a different request', code: 'conflict' } })
    expect(await taskDirs(f.root)).toEqual([first.taskId])
    // The header Firecrawl clients send: alone it is the key; beside a body key it must be the same key.
    const post = (body: unknown, headers: Record<string, string> = {}) => app.request('http://w2l.test/v1/batches', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    const byHeader = await post({ urls: [urls[0]] }, { 'x-idempotency-key': 'header-key' })
    expect(byHeader.status).toBe(202)
    const headerBody = await byHeader.json() as BatchAccepted
    expect(headerBody).toEqual({ taskId: expect.any(String) })
    expect(await (await post({ urls: [urls[0]] }, { 'x-idempotency-key': 'header-key' })).json()).toEqual({ ...headerBody, replayed: true })
    expect(await (await post({ urls: [urls[0]], idempotencyKey: 'header-key' }, { 'Idempotency-Key': 'header-key' })).json()).toEqual({ ...headerBody, replayed: true })
    const mismatch = await post({ urls: [urls[0]], idempotencyKey: 'other' }, { 'x-idempotency-key': 'header-key' })
    expect(mismatch.status).toBe(400)
    expect(await mismatch.json()).toEqual({ error: 'idempotencyKey does not match the x-idempotency-key header', code: 'invalid_request' })
    expect(await w2l.waitBatch(headerBody.taskId)).toMatchObject({ status: 'completed', completed: 1 })
    expect(await taskDirs(f.root)).toEqual([first.taskId, headerBody.taskId].sort())
    expect(f.seen.filter(path => path === '/item/1')).toHaveLength(2)
  })

  it('appends URLs to a running batch, which fetches them in the same attempt, also on a new host, and replays a repeated append', async () => {
    const f = await fixture()
    f.setSlow(true)
    let started!: () => void
    const slowStarted = new Promise<void>(resolve => { started = resolve })
    f.setStarted(started)
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const urls = [1, 2, 3].map(n => `${f.origin}/item/${n}`)
    const { taskId } = await w2l.batchScrape(urls, { formats: ['markdown'] })
    await slowStarted
    const running = await w2l.getBatch(taskId)
    expect(running).toMatchObject({ status: 'running', requested: 3 })
    const more = [`${f.origin}/item/4`, `${f.localhostOrigin}/item/5`]
    const appended = await w2l.appendToBatch(taskId, more, { idempotencyKey: 'append-1' })
    expect(appended).toEqual({ taskId, requested: 5, appended: 2 })
    expect(await w2l.appendToBatch(taskId, more, { idempotencyKey: 'append-1' })).toEqual({ taskId, requested: 5, appended: 2, replayed: true })
    expect(await w2l.getBatch(taskId)).toMatchObject({ requested: 5 })
    f.release()
    const report = await w2l.waitBatch(taskId)
    // Seeded live: the same attempt fetched every URL, the new host's included, once each.
    expect(report).toMatchObject({ status: 'completed', requested: 5, completed: 5, remaining: 0, attemptId: running.attemptId })
    const items = (await w2l.getBatchItems(taskId, { limit: 10 })).items
    expect(items.map(item => [item.url, item.status]).sort()).toEqual([...urls, ...more].map(url => [url, 'success']).sort())
    expect([...f.seen].sort()).toEqual(['/item/1', '/item/2', '/item/3', '/item/4', '/item/5'])
    const store = SqliteTaskStore.openReadOnly(join(f.root, taskId))
    try {
      expect((await store.getTask(taskId))?.batch?.urls).toEqual([...urls, ...more])
      expect((await store.listAttempts(taskId)).length).toBe(1)
    } finally { await store.close() }
    expect(await taskDirs(f.root)).toEqual([taskId])
  })

  it('appends to a completed batch, which runs again for the new URLs in a second attempt, and refuses what an append cannot do by name', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { app, client: w2l } = client(engine)
    const urls = [1, 2].map(n => `${f.origin}/item/${n}`)
    const { taskId } = await w2l.batchScrape(urls)
    const first = await w2l.waitBatch(taskId)
    expect(first).toMatchObject({ status: 'completed', completed: 2 })
    const more = [3, 4, 5, 6, 7].map(n => `${f.origin}/item/${n}`)
    expect(await w2l.appendToBatch(taskId, more)).toEqual({ taskId, requested: 7, appended: 5 })
    const second = await w2l.waitBatch(taskId)
    expect(second).toMatchObject({ status: 'completed', requested: 7, completed: 7, remaining: 0 })
    expect(second.attemptId).not.toBe(first.attemptId)
    // The relaunch fetched the five new URLs alone.
    expect([...f.seen].sort()).toEqual([1, 2, 3, 4, 5, 6, 7].map(n => `/item/${n}`))
    const store = SqliteTaskStore.openReadOnly(join(f.root, taskId))
    try {
      expect((await store.listAttempts(taskId)).map(attempt => attempt.status)).toEqual(['completed', 'completed'])
      expect((await store.getTask(taskId))?.batch?.urls).toEqual([...urls, ...more])
    } finally { await store.close() }
    // Named refusals: a URL already in the batch, an option of the job, a total over 1000, an unknown id, a crawl's id.
    await expect(w2l.appendToBatch(taskId, [`${f.origin}/item/8`, `${f.origin}/item/3`])).rejects.toMatchObject({ status: 400, body: { error: `appended url is already in the batch: ${f.origin}/item/3`, code: 'invalid_request' } })
    const post = (body: unknown) => app.request('http://w2l.test/v1/batches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const changed = await post({ appendToId: taskId, urls: [`${f.origin}/item/8`], formats: ['links'] })
    expect(changed.status).toBe(400)
    expect(await changed.json()).toEqual({ error: 'appendToId keeps the job\'s options; formats cannot be changed', code: 'invalid_request' })
    const tooMany = await post({ appendToId: taskId, urls: Array.from({ length: 994 }, (_, n) => `${f.origin}/item/${n + 100}`) })
    expect(tooMany.status).toBe(400)
    expect(await tooMany.json()).toEqual({ error: 'batch would exceed 1000 URLs', code: 'invalid_request' })
    const unknown = await post({ appendToId: 'nothing', urls: [`${f.origin}/item/8`] })
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toEqual({ error: 'not found', code: 'not_found' })
    const crawl = await engine.startCrawl({ url: urls[0]!, maxPages: 1, sitemap: 'skip' })
    expect((await post({ appendToId: crawl.taskId, urls: [`${f.origin}/item/8`] })).status).toBe(404)
    await w2l.waitCrawl(crawl.taskId)
    // Nothing of that was fetched, and the batch is as the second attempt left it.
    expect(f.seen.filter(path => path === '/item/8' || path === '/item/100')).toEqual([])
    expect(await w2l.getBatch(taskId)).toMatchObject({ status: 'completed', requested: 7, completed: 7 })
    // A cancelled batch takes no more URLs.
    f.setSlow(true)
    let started!: () => void
    const slowStarted = new Promise<void>(resolve => { started = resolve })
    f.setStarted(started)
    const held = await w2l.batchScrape([`${f.origin}/item/2`])
    await slowStarted
    expect(await w2l.cancelBatch(held.taskId)).toMatchObject({ status: 'cancelled' })
    f.release()
    await expect(w2l.appendToBatch(held.taskId, [`${f.origin}/item/9`])).rejects.toMatchObject({ status: 409, body: { error: 'batch is cancelled', code: 'conflict' } })
  })

  it('accepts an append while the one active hosted batch runs, since an append to a running batch adds no job', async () => {
    const f = await fixture({ maxActiveBatches: 1 })
    f.setSlow(true)
    let started!: () => void
    const slowStarted = new Promise<void>(resolve => { started = resolve })
    f.setStarted(started)
    const engine = f.engine()
    cleanup.push(() => engine.close({ cancelActive: true }))
    const { client: w2l } = client(engine)
    const { taskId } = await w2l.batchScrape([`${f.origin}/item/1`, `${f.origin}/item/2`])
    await slowStarted
    await expect(w2l.batchScrape([`${f.origin}/item/3`])).rejects.toMatchObject({ status: 400, body: { error: 'active batch limit reached' } })
    expect(await w2l.appendToBatch(taskId, [`${f.origin}/item/3`])).toEqual({ taskId, requested: 3, appended: 1 })
    f.release()
    expect(await w2l.waitBatch(taskId)).toMatchObject({ status: 'completed', requested: 3, completed: 3, remaining: 0 })
    expect([...f.seen].sort()).toEqual(['/item/1', '/item/2', '/item/3'])
  })

  it('refuses an append that would run a completed batch again while the one active hosted batch runs, and counts the re-run once it is taken', async () => {
    const f = await fixture({ maxActiveBatches: 1 })
    const engine = f.engine()
    cleanup.push(() => engine.close({ cancelActive: true }))
    let releaseReRun = () => {}
    cleanup.push(async () => releaseReRun())
    const { client: w2l } = client(engine)
    const done = await w2l.batchScrape([`${f.origin}/item/1`])
    expect(await w2l.waitBatch(done.taskId)).toMatchObject({ status: 'completed', completed: 1 })
    f.setSlow(true)
    let started!: () => void
    const slowStarted = new Promise<void>(resolve => { started = resolve })
    f.setStarted(started)
    const held = await w2l.batchScrape([`${f.origin}/item/2`])
    await slowStarted
    // The completed batch would be active again: refused as a new batch is, with nothing written to it and nothing recorded for the key.
    const more = [`${f.origin}/item/3`, `${f.origin}/item/4`]
    await expect(w2l.appendToBatch(done.taskId, more, { idempotencyKey: 'append-at-rest' })).rejects.toMatchObject({ status: 400, body: { error: 'active batch limit reached', code: 'invalid_request' } })
    expect(await w2l.getBatch(done.taskId)).toMatchObject({ status: 'completed', requested: 1, completed: 1 })
    f.release()
    expect(await w2l.waitBatch(held.taskId)).toMatchObject({ status: 'completed', completed: 1 })
    // Once the other batch is done the same append goes through under the same key (the refusal left no record to replay), and its
    // re-run is the active batch: held on its first new URL, it refuses a new batch as any active one does.
    let reRunStarted!: () => void
    const reRunning = new Promise<void>(resolve => { reRunStarted = resolve })
    const reRunHeld = new Promise<void>(resolve => { releaseReRun = resolve })
    f.setHold(async path => { if (path.endsWith('/item/3')) { reRunStarted(); await reRunHeld } })
    expect(await w2l.appendToBatch(done.taskId, more, { idempotencyKey: 'append-at-rest' })).toEqual({ taskId: done.taskId, requested: 3, appended: 2 })
    await reRunning
    await expect(w2l.batchScrape([`${f.origin}/item/5`])).rejects.toMatchObject({ status: 400, body: { error: 'active batch limit reached' } })
    releaseReRun()
    expect(await w2l.waitBatch(done.taskId)).toMatchObject({ status: 'completed', requested: 3, completed: 3, remaining: 0 })
    expect([...f.seen].sort()).toEqual(['/item/1', '/item/2', '/item/3', '/item/4'])
    const store = SqliteTaskStore.openReadOnly(join(f.root, done.taskId))
    try { expect((await store.listAttempts(done.taskId)).map(attempt => attempt.status)).toEqual(['completed', 'completed']) } finally { await store.close() }
  })

  it('lists the items that did not succeed on /errors, every attempt included, with the URLs robots.txt refused', async () => {
    const f = await fixture()
    // A server that obeys robots.txt for every URL, as a hosted one does; a local one fetches the URLs a batch names.
    const engine = f.engine({ allowRobotsOverride: false })
    cleanup.push(() => engine.close())
    const { app, client: w2l } = client(engine)
    const urls = [`${f.origin}/item/1`, `${f.origin}/item/2`, `${f.origin}/private/item/3`, `${f.origin}/missing/4`]
    const accepted = await w2l.batchScrape(urls)
    expect(await w2l.waitBatch(accepted.taskId)).toMatchObject({ status: 'completed', completed: 4 })
    const errors = await w2l.getBatchErrors(accepted.taskId)
    expect(errors).toMatchObject({ nextCursor: null, hasMore: false, robotsBlocked: [urls[2]] })
    const byUrl = new Map(errors.errors.map(item => [item.url, item]))
    expect([...byUrl.keys()].sort()).toEqual([urls[2], urls[3]].sort())
    // The 404 page is the http lane's own failure with its status; the robots refusal names the rule.
    expect(byUrl.get(urls[3]!)).toEqual({ id: expect.any(String), timestamp: expect.any(String), url: urls[3], status: 'failed', code: 'http_error', error: 'failed: http_error (HTTP 404)', httpStatus: 404 })
    expect(byUrl.get(urls[2]!)).toEqual({ id: expect.any(String), timestamp: expect.any(String), url: urls[2], status: 'failed', code: 'policy_denied', error: 'failed: policy_denied — robots.txt rule /private', httpStatus: null })
    const items = (await w2l.getBatchItems(accepted.taskId, { limit: 10 })).items
    for (const error of errors.errors) expect(items.find(item => item.id === error.id)).toMatchObject({ url: error.url, createdAt: error.timestamp, failureReason: error.code })
    // Pages of one, with the robots list whole on each page; the limit stops at 1000.
    const first = await w2l.getBatchErrors(accepted.taskId, { limit: 1 })
    expect(first).toMatchObject({ hasMore: true, nextCursor: expect.any(String), robotsBlocked: [urls[2]] })
    const second = await w2l.getBatchErrors(accepted.taskId, { limit: 1, cursor: first.nextCursor! })
    expect(second).toMatchObject({ hasMore: false, nextCursor: null })
    expect([first.errors[0]!.url, second.errors[0]!.url].sort()).toEqual([urls[2], urls[3]].sort())
    const tooMany = await app.request(`/v1/batches/${accepted.taskId}/errors?limit=1001`)
    expect(tooMany.status).toBe(400)
    expect(await tooMany.json()).toEqual({ error: 'limit must be an integer between 1 and 1000', code: 'invalid_request' })
    // A crawl's id and an unknown id are not batches.
    const crawl = await engine.startCrawl({ url: urls[0]!, maxPages: 1, sitemap: 'skip' })
    expect((await app.request(`/v1/batches/${crawl.taskId}/errors`)).status).toBe(404)
    await expect(w2l.getBatchErrors('nothing')).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })

  it('answers a cursor this API did not issue with 400 on every route that pages through steps, not a 500', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { app, client: w2l } = client(engine)
    const batch = await w2l.batchScrape([`${f.origin}/item/1`])
    await w2l.waitBatch(batch.taskId)
    const crawl = await engine.startCrawl({ url: `${f.origin}/item/1`, maxPages: 1, sitemap: 'skip' })
    for (let i = 0; i < 100 && !['completed', 'failed', 'cancelled'].includes((await engine.getCrawl(crawl.taskId))?.status ?? ''); i++) await new Promise((resolve) => setTimeout(resolve, 20))
    for (const path of [`/v1/batches/${batch.taskId}/errors`, `/v1/batches/${batch.taskId}/items`, `/v1/crawl/${crawl.taskId}/pages`, `/v1/crawl/${crawl.taskId}/errors`, `/fc/v1/crawl/${crawl.taskId}`]) {
      for (const cursor of ['not-a-cursor', Buffer.from('{"createdAt":1}').toString('base64url')]) {
        const res = await app.request(`${path}?cursor=${cursor}`)
        expect(res.status, `${path} ${cursor}`).toBe(400)
        expect(await res.json(), path).toMatchObject({ code: 'invalid_request', error: 'cursor is not one this API issued' })
      }
    }
  })

  it('keeps an earlier attempt\'s failure on /errors after an interrupted batch resumes', async () => {
    const f = await fixture()
    f.setSlow(true)
    let started!: () => void
    const slowStarted = new Promise<void>(resolve => { started = resolve })
    f.setStarted(started)
    // Servers that obey robots.txt for every URL, so the first attempt records a refusal.
    const engine1 = f.engine({ allowRobotsOverride: false })
    const urls = [`${f.origin}/private/item/3`, `${f.origin}/item/2`]
    const { taskId } = await engine1.startBatch({ urls })
    await slowStarted
    await engine1.close({ cancelActive: true })
    f.setSlow(false); f.release()
    const engine2 = f.engine({ allowRobotsOverride: false })
    cleanup.push(() => engine2.close())
    const { app, client: w2l } = client(engine2)
    expect(await w2l.waitBatch(taskId)).toMatchObject({ status: 'completed', requested: 2, completed: 2 })
    // The refusal was recorded by the first attempt; the resumed attempt fetched only the interrupted page.
    const store = SqliteTaskStore.openReadOnly(join(f.root, taskId))
    try { expect((await store.listAttempts(taskId)).length).toBe(2) } finally { await store.close() }
    expect(f.seen).toEqual(['/item/2', '/item/2'])
    const errors = await w2l.getBatchErrors(taskId)
    expect(errors.errors.map(item => [item.url, item.status, item.code])).toEqual([[urls[0], 'failed', 'policy_denied']])
    expect(errors.robotsBlocked).toEqual([urls[0]])
    // The crawl route reads the latest attempt alone and so no longer shows it.
    expect((await (await app.request(`/v1/crawl/${taskId}/errors`)).json()).items).toEqual([])
  })

  it('fetches every URL a batch names past robots.txt, a recorded override with its reason, keeps the override on the item and with the task', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const app = createApp(engine)
    const client = new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app.request(String(input), init)) as typeof fetch })
    const urls = [`${f.origin}/item/1`, `${f.origin}/private/item/2`, `${f.origin}/private/item/3`]
    const robotsOverrides = [{ url: urls[1]!, reason: 'The publisher links this item publicly; the rule addresses crawlers.', recordedBy: 'analyst' }]
    const accepted = await client.batchScrape(urls, { robotsOverrides })
    expect(await client.waitBatch(accepted.taskId)).toMatchObject({ status: 'completed', requested: 3, completed: 3 })
    const { items } = await client.getBatchItems(accepted.taskId, { debug: true })
    const byUrl = new Map(items.map(item => [item.url, item]))
    expect(byUrl.get(urls[0]!)).toMatchObject({ status: 'success' })
    expect(byUrl.get(urls[0]!)).not.toHaveProperty('warnings')
    expect(byUrl.get(urls[1]!)).toMatchObject({ status: 'success', warnings: [{ code: 'robots_overridden', message: expect.stringContaining('recorded by analyst') }] })
    expect(byUrl.get(urls[1]!)?.trace.find(event => event.event === 'robots_overridden')?.detail).toMatchObject({ reason: robotsOverrides[0]!.reason, recordedBy: 'analyst' })
    expect(byUrl.get(urls[1]!)?.evidenceRecord?.robotsDecision).toMatchObject({ decision: 'disallowed', userOverride: true, overrideBasis: 'robots_override' })
    // Its neighbour under the same rule is fetched too, because the batch named it, and its record says so.
    expect(byUrl.get(urls[2]!)).toMatchObject({ status: 'success', warnings: [{ code: 'robots_overridden', message: expect.stringContaining('because the request named it') }] })
    expect(byUrl.get(urls[2]!)?.trace.find(event => event.event === 'robots_overridden')?.detail).toMatchObject({ basis: 'user_named_url' })
    expect(byUrl.get(urls[2]!)?.evidenceRecord?.robotsDecision).toMatchObject({ decision: 'disallowed', userOverride: true, overrideBasis: 'user_named_url' })
    expect(f.seen).toContain('/private/item/2')
    expect(f.seen).toContain('/private/item/3')
    expect((await client.getBatchErrors(accepted.taskId)).robotsBlocked).toEqual([])
    // Compact items keep the warning without the trace.
    expect((await client.getBatchItems(accepted.taskId)).items.find(item => item.url === urls[1])).toMatchObject({ trace: [], warnings: [{ code: 'robots_overridden' }] })
    // The override is stored with the task, so a resumed batch runs with it.
    const store = SqliteTaskStore.openReadOnly(join(f.root, accepted.taskId))
    try { expect((await store.getTask(accepted.taskId))?.batch?.robotsOverrides).toEqual(robotsOverrides) } finally { await store.close() }
    const bad = await app.request('http://w2l.test/v1/batches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls, robotsOverrides: [{ url: 'https://elsewhere.test/', reason: 'x' }] }) })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ error: 'robotsOverrides[0].url is not one of the batch urls', code: 'invalid_request' })
  })

  it('counts the items whose site answered its home page in place of the page asked for, and says so on each (IDS Cologne, 2026-11-04)', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const accepted = await w2l.batchScrape([`${f.origin}/item/1`, `${f.origin}/moved/2`])
    const report = await w2l.waitBatch(accepted.taskId)
    // The page came, so it succeeded; the count beside says it is another page's.
    expect(report).toMatchObject({ status: 'completed', succeeded: 2, failed: 0, redirectedOffPage: 1 })
    const items = (await w2l.getBatchItems(accepted.taskId, { limit: 10 })).items
    const moved = items.find((item) => item.url === `${f.origin}/moved/2`)!
    expect(moved).toMatchObject({ status: 'success', readiness: { state: 'not_served', basis: ['redirected_off_page'] } })
    expect(moved.warnings?.map((warning) => warning.code)).toEqual(['redirected_off_page'])
    expect(moved.warnings?.[0]?.message).toContain(`${f.origin}/moved/2`)
    expect(moved.evidenceRecord).toMatchObject({ finalUrl: `${f.origin}/`, redirectChain: { urls: [`${f.origin}/moved/2`, `${f.origin}/`] } })
    expect(moved.agentHints?.some((hint) => hint.includes(`in place of ${f.origin}/moved/2`))).toBe(true)
    expect(items.find((item) => item.url === `${f.origin}/item/1`)).toMatchObject({ status: 'success', readiness: { state: 'ready' } })
  })

  it('writes results.jsonl, results.csv and each page\'s Markdown beside the checkpoint when a batch ends, names them in its status, and not before', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const accepted = await w2l.batchScrape([`${f.origin}/item/1`, `${f.origin}/missing/2`, `${f.origin}/moved/3`])
    const report = await w2l.waitBatch(accepted.taskId)
    expect(report.status).toBe('completed')
    const dir = join(f.root, accepted.taskId)
    expect(report.resultFiles).toEqual({ jsonl: join(dir, 'results.jsonl'), csv: join(dir, 'results.csv'), markdown: join(dir, 'markdown') })
    // A page a line, as get_batch_items lists them: the failed page too, without its trace.
    const lines = (await readFile(join(dir, 'results.jsonl'), 'utf8')).split('\n').filter((line) => line.length > 0)
    expect(lines).toHaveLength(3)
    const pages = lines.map((line) => JSON.parse(line) as { url: string; status: string; markdown?: string; trace?: unknown[]; evidenceRecord?: { finalUrl: string } })
    expect(pages.map((page) => page.status).sort()).toEqual(['failed', 'success', 'success'])
    expect(pages.find((page) => page.url === `${f.origin}/item/1`)?.markdown).toContain('Fixture item 1')
    expect(pages.every((page) => page.trace === undefined || page.trace.length === 0)).toBe(true)
    // One row a page, the CLI's evidence columns and the page's Markdown file.
    const csv = (await readFile(join(dir, 'results.csv'), 'utf8')).split('\r\n').filter((line) => line.length > 0)
    expect(csv[0]).toBe(RESULT_FILE_COLUMNS.join(','))
    expect(csv).toHaveLength(4)
    const rows = csv.slice(1).map((line) => Object.fromEntries(line.split(',').map((value, i) => [RESULT_FILE_COLUMNS[i], value])))
    expect(rows.find((row) => row.url === `${f.origin}/moved/3`)).toMatchObject({ status: 'success', final_url: `${f.origin}/`, http_status: '200' })
    expect(rows.find((row) => row.url === `${f.origin}/missing/2`)).toMatchObject({ status: 'failed', http_status: '404' })
    // A file a page read, named by its line, which its row names; the failed page has none, though it carries the 404 page's Markdown.
    const item = rows.find((row) => row.url === `${f.origin}/item/1`)!
    const line = pages.findIndex((page) => page.url === `${f.origin}/item/1`) + 1
    expect(item.markdown_file).toBe(`markdown/${String(line).padStart(4, '0')}-${new URL(f.origin).host.replace(':', '-')}-item-1.md`)
    expect(await readFile(join(dir, item.markdown_file!), 'utf8')).toBe(pages[line - 1]!.markdown)
    const files = await readdir(join(dir, 'markdown'))
    expect(files).toHaveLength(2)
    expect(pages.find((page) => page.url === `${f.origin}/missing/2`)?.markdown).toContain('Not Found')
    // Rows and lines are in one order, so row n names the file of line n, or nothing for a page not read.
    expect(rows.map((row) => row.markdown_file)).toEqual(pages.map((page, i) => page.status === 'success' ? `markdown/${markdownFileName(i + 1, page.url)}` : ''))
    // A batch still running names no files.
    f.setSlow(true)
    const running = await w2l.batchScrape([`${f.origin}/item/2`])
    await new Promise<void>((resolve) => f.setStarted(resolve))
    expect((await w2l.getBatch(running.taskId)).resultFiles).toBeUndefined()
    expect(existsSync(join(f.root, running.taskId, 'results.jsonl'))).toBe(false)
    f.release()
    expect((await w2l.waitBatch(running.taskId)).resultFiles).toBeDefined()
  })

  it('says on a finished batch how many pages read held nothing selected, and which json fields had no source on how many', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const urls = [`${f.origin}/item/1`, `${f.origin}/item/2`]
    const selected = await w2l.waitBatch((await w2l.batchScrape(urls, { includeTags: ['.no-such-part'] })).taskId)
    expect(selected.agentHints).toEqual([expect.stringMatching(/^on 2 of 2 pages read, includeTags selected nothing to read: its selectors matched no element there/)])
    const extracted = await w2l.waitBatch((await w2l.batchScrape(urls, { formats: [{ type: 'json', schema: { type: 'object', properties: { license: { type: ['string', 'null'] } }, required: ['license'] } }] })).taskId)
    expect(extracted.agentHints).toEqual([expect.stringMatching(/^json found no source for \/license on 2 of 2 pages read; such a field stays null: /)])
    // A batch whose pages gave what was asked says nothing of the kind.
    expect((await w2l.waitBatch((await w2l.batchScrape(urls)).taskId)).agentHints).toBeUndefined()
  })

  it('writes no result files on a hosted engine, which keeps no files', async () => {
    const f = await fixture()
    const engine = f.engine({ hosted: true, noFileStore: true })
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const accepted = await w2l.batchScrape([`${f.origin}/item/1`])
    const report = await w2l.waitBatch(accepted.taskId)
    expect(report.status).toBe('completed')
    expect(report.resultFiles).toBeUndefined()
    expect(existsSync(join(f.root, accepted.taskId, 'results.jsonl'))).toBe(false)
    expect(existsSync(join(f.root, accepted.taskId, 'markdown'))).toBe(false)
  })

  it('counts every read page that is not the page asked for, and names each beside the errors, which stay the items that failed', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const accepted = await w2l.batchScrape([`${f.origin}/item/1`, `${f.origin}/moved/2`, `${f.origin}/item/3`], { retry: { softBlocks: 0 }, verify: { checks: [{ type: 'markdownMatches', pattern: 'Fixture item \\d' }, { type: 'markdownExcludes', text: 'Fixture item 3' }] } })
    const report = await w2l.waitBatch(accepted.taskId)
    expect(report).toMatchObject({ status: 'completed', succeeded: 3, failed: 0, redirectedOffPage: 1, notServed: 2 })
    const listed = await w2l.getBatchErrors(accepted.taskId)
    expect(listed.errors).toEqual([])
    expect(listed.notServed.map(({ url, status, code, finalUrl }) => ({ url, status, code, finalUrl })).sort((a, b) => a.url.localeCompare(b.url))).toEqual([
      { url: `${f.origin}/item/3`, status: 'success', code: 'excluded_text', finalUrl: `${f.origin}/item/3` },
      { url: `${f.origin}/moved/2`, status: 'success', code: 'redirected_off_page', finalUrl: `${f.origin}/` },
    ])
    // A contract the page passes holds: the warning is still counted, and the page is what the task asked for.
    const accepting = await w2l.batchScrape([`${f.origin}/moved/4`], { retry: { softBlocks: 0 }, verify: { checks: [{ type: 'markdownIncludes', text: 'Fixture item' }] } })
    expect(await w2l.waitBatch(accepting.taskId)).toMatchObject({ redirectedOffPage: 1, notServed: 0 })
    expect((await w2l.getBatchErrors(accepting.taskId)).notServed).toEqual([])
  })

  it('reads again a page the site sent away, after the wait, and stores it once, as the page it asked for', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const urls = [`${f.origin}/once-moved/1`, `${f.origin}/item/2`]
    const accepted = await w2l.batchScrape(urls)
    const report = await w2l.waitBatch(accepted.taskId, { timeoutMs: 30_000 })
    expect(report).toMatchObject({ status: 'completed', requested: 2, completed: 2, succeeded: 2, failed: 0, redirectedOffPage: 0, notServed: 0, retried: 1 })
    const items = (await w2l.getBatchItems(accepted.taskId, { limit: 10, debug: true })).items
    expect(items.map((item) => item.url).sort()).toEqual([...urls].sort())
    const read = items.find((item) => item.url === urls[0])!
    expect(read).toMatchObject({ status: 'success', readiness: { state: 'ready' }, evidenceRecord: { finalUrl: urls[0] } })
    expect(read.trace.find((event) => event.event === 'soft_block_retry')?.detail).toMatchObject({ read: 1, signal: 'redirected_off_page', finalUrl: `${f.origin}/` })
  })

  it('reads again from the site, not from the cache, whatever maxAge says', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const accepted = await w2l.batchScrape([`${f.origin}/once-moved/9`], { maxAge: 600_000 })
    expect(await w2l.waitBatch(accepted.taskId, { timeoutMs: 30_000 })).toMatchObject({ succeeded: 1, redirectedOffPage: 0, retried: 1 })
    expect(f.seen.filter((path) => path === '/once-moved/9')).toHaveLength(2)
  })

  it('refuses a retry it cannot honour, by name', async () => {
    for (const retry of [{ softBlocks: 4 }, { softBlocks: -1 }, { softBlocks: 1.5 }, {}, 1]) expect(() => parseBatchStartRequest({ urls: ['https://example.com/'], retry }), JSON.stringify(retry)).toThrow(/retry/)
    expect(() => parseBatchStartRequest({ urls: ['https://example.com/'], retry: { softBlocks: 1, other: 1 } })).toThrow(/other/)
    expect(parseBatchStartRequest({ urls: ['https://example.com/'], retry: { softBlocks: 0 } }).retry).toEqual({ softBlocks: 0 })
  })

  it('slows a host after two pages in a row that the site answered with another page: one page at a time, the host left alone for a minute, and the status says so', async () => {
    // One page at a time on the host, so the two redirected pages answer one after the other: two signals in a row.
    const f = await fixture({ perHostConcurrency: 1 })
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const starts = new Map<string, number>()
    f.setHold(async (path) => { starts.set(path, Date.now()) })
    const { client: w2l } = client(engine)
    const accepted = await w2l.batchScrape([`${f.origin}/moved/1`, `${f.origin}/moved/2`, `${f.origin}/item/3`, `${f.origin}/item/4`], { retry: { softBlocks: 0 } })
    const deadline = Date.now() + 15_000
    let status = await w2l.getBatch(accepted.taskId)
    while (status.pacing?.['127.0.0.1']?.slowdowns !== 1 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      status = await w2l.getBatch(accepted.taskId)
    }
    expect(status).toMatchObject({ status: 'running', pacing: { '127.0.0.1': { ceiling: 1, delayMs: 2_000, slowdowns: 1 } } })
    expect(Date.parse(status.pacing!['127.0.0.1']!.cooldownUntil!) - Date.now()).toBeGreaterThan(50_000)
    expect(starts.has('/item/3')).toBe(false)
    await w2l.cancelBatch(accepted.taskId)
  })

  it('lists items with the fields asked for alone (id, url, status and createdAt always), so a JSON batch comes back without markdown or evidence; an unknown field is refused by name', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const app = createApp(engine)
    const client = new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app.request(String(input), init)) as typeof fetch })
    const accepted = await client.batchScrape([`${f.origin}/item/1`, `${f.origin}/moved/2`], { formats: [{ type: 'json', schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } }] })
    await client.waitBatch(accepted.taskId)
    const projected = await client.getBatchItems(accepted.taskId, { limit: 10, fields: ['json', 'warnings'] })
    expect(projected.items).toHaveLength(2)
    const one = projected.items.find((item) => item.url === `${f.origin}/item/1`)!
    expect(Object.keys(one).sort()).toEqual(['createdAt', 'id', 'json', 'status', 'url'])
    expect((one.json?.data as { title: string }).title).toBe('Fixture item 1')
    const moved = projected.items.find((item) => item.url === `${f.origin}/moved/2`)!
    expect(moved.warnings?.map((warning) => warning.code)).toEqual(['redirected_off_page'])
    expect(moved).not.toHaveProperty('evidenceRecord')
    // Over REST, as a comma list; the cursor still pages.
    const res = await app.request(`/v1/batches/${accepted.taskId}/items?limit=1&fields=status`)
    expect(res.status).toBe(200)
    const body = await res.json() as { items: Array<Record<string, unknown>>; nextCursor: string | null; hasMore: boolean }
    expect(Object.keys(body.items[0]!).sort()).toEqual(['createdAt', 'id', 'status', 'url'])
    expect(body.hasMore).toBe(true)
    const refused = await app.request(`/v1/batches/${accepted.taskId}/items?fields=url,finalUrl`)
    expect(refused.status).toBe(400)
    expect(await refused.text()).toContain('fields names no item field: finalUrl')
  })

  it('says the rate of a running batch from its pages read, null until there are enough, and nothing once it has ended', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    let open = () => {}
    const held = new Promise<void>((resolve) => { open = resolve })
    f.setHold(async (path) => { if (path === '/item/9') await held })
    const urls = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${f.origin}/item/${n}`)
    const accepted = await w2l.batchScrape(urls)
    // This fixture sets no interval between pages, so no floor can be said.
    expect(accepted).not.toHaveProperty('minimumSeconds')
    let running = await w2l.getBatch(accepted.taskId)
    expect(running).toHaveProperty('rate')
    for (let i = 0; i < 200 && running.completed < 8; i++) { await new Promise((resolve) => setTimeout(resolve, 25)); running = await w2l.getBatch(accepted.taskId) }
    expect(running.completed).toBe(8)
    expect(running.rate).toMatchObject({ pagesPerMinute: expect.any(Number), etaSeconds: expect.any(Number), measuredPages: 8 })
    expect(running.rate!.pagesPerMinute!).toBeGreaterThan(0)
    open()
    const report = await w2l.waitBatch(accepted.taskId)
    expect(report.status).toBe('completed')
    expect(report).not.toHaveProperty('rate')
  })

  it('answers a start with the floor the per-host interval sets, and not an append or a batch with no interval', async () => {
    const f = await fixture()
    const engine = f.engine({ networkPolicy: { ...localNetworkPolicy(), perHostConcurrency: 1, perHostMinDelayMs: 600 } })
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const accepted = await w2l.batchScrape([1, 2, 3].map((n) => `${f.origin}/item/${n}`))
    expect(accepted).toMatchObject({ minimumSeconds: 1 })
    const appended = await w2l.appendToBatch(accepted.taskId, [`${f.origin}/item/4`])
    expect(appended).not.toHaveProperty('minimumSeconds')
  })

  it('persists JSON-only results, paginates all URLs, and sends a terminal SSE event', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const app = createApp(engine)
    const client = new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app.request(String(input), init)) as typeof fetch })
    const urls = [1, 2, 3].map(n => `${f.origin}/item/${n}`)
    const accepted = await client.batchScrape(urls, { formats: [{ type: 'json', schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } }] })
    const report = await client.waitBatch(accepted.taskId)
    expect(report).toMatchObject({ status: 'completed', requested: 3, completed: 3, remaining: 0, succeeded: 3, failed: 0 })
    const first = await client.getBatchItems(accepted.taskId, { limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.hasMore).toBe(true)
    const second = await client.getBatchItems(accepted.taskId, { limit: 2, cursor: first.nextCursor! })
    expect(second.items).toHaveLength(1)
    const items = [...first.items, ...second.items]
    expect(new Set(items.map(item => item.url))).toEqual(new Set(urls))
    expect(items.every(item => item.markdown === null && item.links === undefined && item.json?.status === 'complete')).toBe(true)
    expect(items.every(item => (item.usage?.attemptCount ?? 0) >= 1 && (item.usage?.wallMs ?? -1) >= 0)).toBe(true)
    expect(items.map(item => (item.json?.data as { title: string }).title).sort()).toEqual(['Fixture item 1', 'Fixture item 2', 'Fixture item 3'])
    expect(items.every(item => item.audit === undefined && item.trace.length === 0)).toBe(true)
    const debug = await client.getBatchItems(accepted.taskId, { limit: 1, debug: true })
    expect(debug.items[0]?.audit?.summary).toBeDefined()
    expect(debug.items[0]?.audit?.summary.attempts[0]?.result.markdown).toBeNull()
    expect((await app.request(`/v1/batches/${accepted.taskId}/items?limit=51`)).status).toBe(400)
    const events = await app.request(`/v1/batches/${accepted.taskId}/events`)
    expect(events.headers.get('content-type')).toContain('text/event-stream')
    const streamed = await events.text()
    expect(streamed).toContain('event: catchup')
    expect(streamed.match(/event: document/g)).toHaveLength(3)
    expect(streamed).toContain('event: done')
    expect(streamed).not.toContain('event: complete')
  })

  it('counts succeeded and failed across a mixed batch, each URL once in its items with its json or its reason', async () => {
    const f = await fixture()
    // A server that obeys robots.txt for every URL, so one item is refused by it.
    const engine = f.engine({ allowRobotsOverride: false })
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const urls = [`${f.origin}/item/1`, `${f.origin}/private/item/2`, `${f.origin}/missing/4`]
    const accepted = await w2l.batchScrape(urls, { formats: [{ type: 'json', schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } }] })
    expect(await w2l.waitBatch(accepted.taskId)).toMatchObject({ status: 'completed', requested: 3, completed: 3, succeeded: 1, failed: 2, remaining: 0 })
    const items = (await w2l.getBatchItems(accepted.taskId, { limit: 10 })).items
    expect(items.map(item => item.url).sort()).toEqual([...urls].sort())
    const byUrl = new Map(items.map(item => [item.url, item]))
    expect(byUrl.get(urls[0]!)).toMatchObject({ status: 'success', failureReason: null, json: { status: 'complete', data: { title: 'Fixture item 1' } } })
    expect(byUrl.get(urls[1]!)).toMatchObject({ status: 'failed', failureReason: 'policy_denied', json: { status: 'incomplete' } })
    expect(byUrl.get(urls[2]!)).toMatchObject({ status: 'failed', failureReason: 'http_error', agentHints: [expect.stringContaining('check the link')] })
    expect(f.seen).not.toContain('/private/item/2')
  })

  it('counts a page the server answers with 204 as succeeded: an item without content, not an error', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const { app, client: w2l } = client(engine)
    const urls = [`${f.origin}/item/1`, `${f.origin}/empty/2`, `${f.origin}/missing/4`]
    const accepted = await w2l.batchScrape(urls)
    // A page read, with or without content, succeeded; only the 404 failed.
    expect(await w2l.waitBatch(accepted.taskId)).toMatchObject({ status: 'completed', requested: 3, completed: 3, succeeded: 2, failed: 1, remaining: 0 })
    const items = (await w2l.getBatchItems(accepted.taskId, { limit: 10 })).items
    expect(items.map(item => item.url).sort()).toEqual([...urls].sort())
    expect(items.find(item => item.url === urls[1])).toMatchObject({ status: 'empty_verified', failureReason: null, lane: 'http', markdown: null })
    expect(f.seen).toContain('/empty/2')
    // The empty page is not an error, and the stream lists every page read as a document, that one included.
    expect((await w2l.getBatchErrors(accepted.taskId)).errors.map(error => error.url)).toEqual([urls[2]])
    const streamed = await (await app.request(`/v1/batches/${accepted.taskId}/events`)).text()
    expect(streamed.match(/event: document/g)).toHaveLength(3)
  })

  it('finishes every URL when one origin never answers its robots.txt, and does not fetch that origin', async () => {
    const f = await fixture()
    let silentPageHits = 0
    const silent = createServer((req, res) => {
      if (req.url === '/robots.txt') return // never answers
      silentPageHits++
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><body><main><article><h1>Silent robots</h1><p>This origin never answers its robots.txt, so the lookup deadline must count as an unreachable robots.txt instead of failing the batch that contains it.</p></article></main></body></html>')
    })
    await new Promise<void>(resolve => silent.listen(0, '127.0.0.1', resolve))
    cleanup.push(async () => { silent.closeAllConnections(); await new Promise<void>(resolve => silent.close(() => resolve())) })
    const silentUrl = `http://127.0.0.1:${(silent.address() as AddressInfo).port}/page`
    // A server that obeys robots.txt for every URL; a local one fetches a URL a batch names past an unreachable robots.txt (resilientHttp.robots.test.ts).
    const engine = createApiEngine({ taskRoot: f.root, networkPolicy: { ...localNetworkPolicy(), perHostMinDelayMs: 0, robotsTimeoutMs: 100 }, workerCount: 2, allowRobotsOverride: false })
    cleanup.push(() => engine.close())
    const urls = [silentUrl, `${f.origin}/item/1`, `${f.origin}/item/2`]
    const { taskId } = await engine.startBatch({ urls })
    let report = await engine.getBatch(taskId)
    for (let i = 0; i < 200 && (report === null || ['pending', 'running'].includes(report.status)); i++) {
      await new Promise(resolve => setTimeout(resolve, 25))
      report = await engine.getBatch(taskId)
    }
    expect(report).toMatchObject({ status: 'completed', requested: 3, completed: 3 })
    const items = (await engine.getBatchItems(taskId, { limit: 10, debug: true }))!.items
    const silentItem = items.find(item => item.url === silentUrl)!
    expect(items.filter(item => item !== silentItem).map(item => item.status)).toEqual(['success', 'success'])
    // RFC 9309 §2.3.1.4: an unreachable robots.txt is a complete disallow, and the item says why.
    expect(silentItem).toMatchObject({ status: 'failed', failureReason: 'policy_denied', markdown: null })
    expect(silentItem.trace).toContainEqual(expect.objectContaining({ event: 'robots_checked', detail: expect.objectContaining({ decision: 'disallowed', unreachable: 'timeout' }) }))
    expect(silentPageHits).toBe(0)
  })

  it('recovers an interrupted URL without refetching completed items', async () => {
    const f = await fixture()
    f.setSlow(true)
    let started!: () => void
    const secondStarted = new Promise<void>(resolve => { started = resolve })
    f.setStarted(started)
    const engine1 = f.engine()
    const app1 = createApp(engine1)
    const client1 = new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app1.request(String(input), init)) as typeof fetch })
    const accepted = await client1.batchScrape([`${f.origin}/item/1`, `${f.origin}/item/2`], { formats: ['markdown', 'links'] })
    await secondStarted
    await engine1.close({ cancelActive: true })
    const paused = await client1.getBatch(accepted.taskId)
    expect(paused.status).toBe('paused')
    f.setSlow(false); f.release()
    const engine2 = f.engine()
    cleanup.push(() => engine2.close())
    const app2 = createApp(engine2)
    const client2 = new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app2.request(String(input), init)) as typeof fetch })
    const recovered = await client2.waitBatch(accepted.taskId)
    expect(recovered).toMatchObject({ status: 'completed', requested: 2, completed: 2, remaining: 0 })
    expect(f.seen.filter(url => url === '/item/1')).toHaveLength(1)
    expect(f.seen.filter(url => url === '/item/2')).toHaveLength(2)
    // Links requested at submission survive the restart: item 1 comes from the first run, item 2 from the resumed one.
    const { items } = await client2.getBatchItems(accepted.taskId)
    expect(items.map(item => [item.url, item.links])).toEqual([1, 2].map(n => [`${f.origin}/item/${n}`, [`${f.origin}/item/details`]]))
  })

  it('keeps a recorded robots override when an interrupted batch resumes', async () => {
    const f = await fixture()
    f.setSlow(true)
    let started!: () => void
    const slowStarted = new Promise<void>(resolve => { started = resolve })
    f.setStarted(started)
    const engine1 = f.engine()
    const url = `${f.origin}/private/item/2`
    const { taskId } = await engine1.startBatch({ urls: [url], robotsOverrides: [{ url, reason: 'The publisher links this item publicly.' }] })
    await slowStarted
    await engine1.close({ cancelActive: true })
    f.setSlow(false); f.release()
    const engine2 = f.engine()
    cleanup.push(() => engine2.close())
    const app2 = createApp(engine2)
    const client2 = new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app2.request(String(input), init)) as typeof fetch })
    expect(await client2.waitBatch(taskId)).toMatchObject({ status: 'completed', requested: 1, completed: 1 })
    // Fetched again by the restarted process, under the override stored with the task.
    expect(f.seen.filter(path => path === '/private/item/2')).toHaveLength(2)
    expect((await client2.getBatchItems(taskId)).items).toMatchObject([{ url, status: 'success', warnings: [{ code: 'robots_overridden' }] }])
  })

  it('a server that takes no robots override applies none to a stored batch it resumes', async () => {
    const f = await fixture()
    f.setSlow(true)
    let started!: () => void
    const slowStarted = new Promise<void>(resolve => { started = resolve })
    f.setStarted(started)
    const local = f.engine()
    const url = `${f.origin}/private/item/2`
    const { taskId } = await local.startBatch({ urls: [url], robotsOverrides: [{ url, reason: 'The publisher links this item publicly.' }] })
    await slowStarted
    await local.close({ cancelActive: true })
    f.setSlow(false); f.release()
    // The same task root, now served as `--hosted` serves it.
    const hosted = f.engine({ allowRobotsOverride: false })
    cleanup.push(() => hosted.close())
    const app = createApp(hosted)
    const client = new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app.request(String(input), init)) as typeof fetch })
    expect(await client.waitBatch(taskId)).toMatchObject({ status: 'completed', requested: 1, completed: 1 })
    const { items } = await client.getBatchItems(taskId)
    expect(items).toMatchObject([{ url, status: 'failed', failureReason: 'policy_denied', evidenceRecord: { robotsDecision: { decision: 'disallowed', userOverride: false } } }])
    expect(items[0]).not.toHaveProperty('warnings')
    // Only the local server's request reached the page.
    expect(f.seen.filter(path => path === '/private/item/2')).toHaveLength(1)
  })

  it('keeps the override on a scrape and a batch item whose deadline passes while the overridden request is out', async () => {
    const f = await fixture()
    f.setSlow(true)
    const engine = f.engine()
    cleanup.push(() => engine.close({ cancelActive: true }))
    const app = createApp(engine)
    const client = new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app.request(String(input), init)) as typeof fetch })
    const url = `${f.origin}/private/item/2`
    const override = { reason: 'The publisher links this item publicly.', recordedBy: 'analyst' }
    // The HTTP rung is still waiting for the page at the deadline. Whether the ladder then builds the timeout
    // (the rung returned nothing) or the rung reports its own deadline first, the result says the rule was set aside.
    const timedOut = {
      status: 'failed', failureReason: 'timeout', usage: { deadlineExceeded: true },
      warnings: [{ code: 'robots_overridden', message: expect.stringContaining('it was fetched under an override recorded by analyst') }],
      evidenceRecord: { robotsDecision: { decision: 'disallowed', userOverride: true } },
    }
    const recorded = (trace: readonly { event: string }[]) => trace.map(event => event.event).filter(name => name.startsWith('robots_') || name === 'deadline_exceeded')
    const events = ['robots_checked', 'robots_disallowed', 'robots_overridden', 'deadline_exceeded']
    const full = await client.scrape(url, { robotsOverride: override, timeout: 1_000, debug: true })
    expect(full).toMatchObject(timedOut)
    expect(recorded(full.trace)).toEqual(events)
    expect(await client.scrape(url, { robotsOverride: override, timeout: 1_000, debug: false })).toMatchObject(timedOut)
    const { taskId } = await client.batchScrape([url], { robotsOverrides: [{ url, ...override }], timeout: 1_000 })
    expect(await client.waitBatch(taskId)).toMatchObject({ requested: 1, completed: 1 })
    expect((await client.getBatchItems(taskId)).items).toMatchObject([{ url, ...timedOut }])
    expect(recorded((await client.getBatchItems(taskId, { debug: true })).items[0]!.trace)).toEqual(events)
    // Each of the three requests went out past the rule before its deadline.
    expect(f.seen.filter(path => path === '/private/item/2')).toHaveLength(3)
  })

  it("caps a batch's third-party spend with the access grant's run budget, and local pages, which cost nothing, never trip it", async () => {
    const f = await fixture()
    const engine = f.engine({ accessGrant: { tier: 'standard', capabilities: [], budget: { perRequestUsd: null, perRunUsd: 1 }, scope: { hosts: null }, attestation: null, tariffs: {} } })
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const urls = [1, 2, 3].map(n => `${f.origin}/item/${n}`)
    const accepted = await w2l.batchScrape(urls)
    // Before local lanes reported a known 0, every page's cost read as unknown and a capped batch stopped after its first page (cost_unknown).
    expect(await w2l.waitBatch(accepted.taskId)).toMatchObject({ status: 'completed', completed: 3 })
    const items = (await w2l.getBatchItems(accepted.taskId)).items
    expect(items.map(item => item.status)).toEqual(['success', 'success', 'success'])
    const store = SqliteTaskStore.openReadOnly(join(f.root, accepted.taskId))
    try { expect((await store.getTask(accepted.taskId))?.budget).toMatchObject({ maxCostUsd: 1 }) } finally { await store.close() }
  })

  it('does not stop a capped batch for a page whose scrape threw, when the server has no paid route', async () => {
    const f = await fixture()
    const policy = { ...localNetworkPolicy(), perHostConcurrency: 1, perHostMinDelayMs: 0 }
    const throwing = (mode: 'standard' | 'research' | 'authed') => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http').map(channel => ({
      ...channel,
      fetch: async (...args: Parameters<typeof channel.fetch>) => { if (String(args[0]).endsWith('/item/2')) throw new Error('scrape broke'); return channel.fetch(...args) },
    }))
    const engine = f.engine({ channelsFor: throwing, accessGrant: { tier: 'standard', capabilities: [], budget: { perRequestUsd: null, perRunUsd: 1 }, scope: { hosts: null }, attestation: null, tariffs: {} } })
    cleanup.push(() => engine.close())
    const { client: w2l } = client(engine)
    const { taskId } = await w2l.batchScrape([1, 2, 3, 4].map(n => `${f.origin}/item/${n}`))
    // The page that threw is one failed item; with no provider to have called, its cost is a known 0 and the cap holds no reason to stop.
    expect(await w2l.waitBatch(taskId)).toMatchObject({ status: 'completed', completed: 4 })
    const items = (await w2l.getBatchItems(taskId)).items
    expect(items.map(item => [new URL(item.url).pathname, item.status]).sort()).toEqual([['/item/1', 'success'], ['/item/2', 'failed'], ['/item/3', 'success'], ['/item/4', 'success']])
    const store = SqliteTaskStore.openReadOnly(join(f.root, taskId))
    try { expect((await store.listAttempts(taskId)).at(-1)?.budgetExceeded).toBeNull() } finally { await store.close() }
  })

  it('applies the run budget of a grant given after the batch was created, when the batch runs again', async () => {
    const f = await fixture()
    const policy = { ...localNetworkPolicy(), perHostConcurrency: 1, perHostMinDelayMs: 0 }
    // The http rung with its cost made unknown stands in for a provider that does not state a price.
    const unpriced = (mode: 'standard' | 'research' | 'authed') => buildChannels(mode, { networkPolicy: policy }).filter(channel => channel.id === 'http').map(channel => ({
      ...channel,
      fetch: async (...args: Parameters<typeof channel.fetch>) => { const r = await channel.fetch(...args); return { ...r, usage: { ...r.usage, externalCostUsd: null } } },
    }))
    const before = f.engine({ channelsFor: unpriced })
    const { taskId } = await client(before).client.batchScrape([`${f.origin}/item/1`])
    expect(await client(before).client.waitBatch(taskId)).toMatchObject({ status: 'completed', completed: 1 })
    await before.close()
    const granted = f.engine({ channelsFor: unpriced, accessGrant: { tier: 'standard', capabilities: [], budget: { perRequestUsd: null, perRunUsd: 1 }, scope: { hosts: null }, attestation: null, tariffs: {} } })
    cleanup.push(() => granted.close())
    const { client: w2l } = client(granted)
    await w2l.appendToBatch(taskId, [`${f.origin}/item/2`, `${f.origin}/item/3`])
    // The batch was created with no cost cap; run again under the grant, its first unpriced page stops it rather than a guess.
    expect(await w2l.waitBatch(taskId)).toMatchObject({ requested: 3, completed: 2 })
    const store = SqliteTaskStore.openReadOnly(join(f.root, taskId))
    try { expect((await store.listAttempts(taskId)).at(-1)?.budgetExceeded).toBe('cost_unknown') } finally { await store.close() }
  })

  it('pages a 100-URL durable batch without returning the whole result set at once', async () => {
    const f = await fixture()
    const engine = f.engine()
    cleanup.push(() => engine.close())
    const app = createApp(engine)
    const client = new W2L({ baseUrl: 'http://w2l.test', fetch: ((input, init) => app.request(String(input), init)) as typeof fetch })
    const urls = Array.from({ length: 100 }, (_, n) => `${f.origin}/item/${n + 1}`)
    const accepted = await client.batchScrape(urls)
    expect(await client.waitBatch(accepted.taskId)).toMatchObject({ status: 'completed', requested: 100, completed: 100 })
    const first = await client.getBatchItems(accepted.taskId, { limit: 50 })
    expect(first.items).toHaveLength(50)
    expect(first.hasMore).toBe(true)
    const second = await client.getBatchItems(accepted.taskId, { limit: 50, cursor: first.nextCursor! })
    expect(second.items).toHaveLength(50)
    expect(second.hasMore).toBe(false)
    expect(new Set([...first.items, ...second.items].map(item => item.url))).toEqual(new Set(urls))
    expect(first.items.every(item => item.audit === undefined && item.trace.length === 0)).toBe(true)
  })

  it('enforces a single active hosted batch across the persisted task state', async () => {
    const f = await fixture({maxActiveBatches:1})
    f.setSlow(true)
    let started!: () => void
    const secondStarted = new Promise<void>(resolve => { started = resolve })
    f.setStarted(started)
    const engine = f.engine()
    cleanup.push(() => engine.close({cancelActive:true}))
    const first = await engine.startBatch({urls:[`${f.origin}/item/1`,`${f.origin}/item/2`],mode:'standard'})
    await secondStarted
    await expect(engine.startBatch({urls:[`${f.origin}/item/3`],mode:'standard'})).rejects.toThrow('active batch limit reached')
    f.release()
    expect((await engine.getBatch(first.taskId))?.requested).toBe(2)
  })
})
