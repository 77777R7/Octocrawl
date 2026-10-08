import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localNetworkPolicy } from '@w2l/contracts'
import { accessGrantFromText } from '@w2l/http-core'
import { buildChannels } from '@w2l/bench'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/**
 * ADR 0005 `egress_sessions` in the engine: a batch under a grant that names it keeps the cookies its
 * pages set and sends them to their site on its later pages; without the grant nothing changes. The
 * cookie values reach no stored step, and no page read with them is cached.
 */

/** The task's cookie session file: one per route, named by the route's hash. */
const sessionFile = (taskDir: string): string => {
  const names = existsSync(taskDir) ? readdirSync(taskDir).filter((name) => /^cookie-session\.[0-9a-f]+\.json$/.test(name)) : []
  return join(taskDir, names[0] ?? 'cookie-session.none.json')
}
const hasSessionFile = (taskDir: string): boolean => existsSync(taskDir) && readdirSync(taskDir).some((name) => name.startsWith('cookie-session'))
/** Whether the task's session file is still there 2 s on: the run writes its terminal status first and removes the file after its job events. */
async function sessionFileStays(taskDir: string): Promise<boolean> {
  for (let i = 0; i < 100 && hasSessionFile(taskDir); i++) await new Promise((resolve) => setTimeout(resolve, 20))
  return hasSessionFile(taskDir)
}

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const PAGE = `<!doctype html><html><head><title>Tides</title></head><body><article><h1>Tide ledger</h1><p>${PROSE}</p></article></body></html>`
const TOKEN = 'batch-token-5d1e'
let server: Server
let origin: string
const hits: string[] = []
// The resumed page's request waits here until the test lets it answer.
let holdSlow = false
let slowStarted: (() => void) | null = null
const held: (() => void)[] = []
let root: string
let engine: ApiEngine | null = null

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? '')
    if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
    if (req.url === '/start') return void res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': `token=${TOKEN}; Path=/` }).end(PAGE)
    if (req.url === '/needs-slow') {
      const answer = () => {
        const ok = (req.headers.cookie ?? '').includes(`token=${TOKEN}`)
        res.writeHead(ok ? 200 : 403, { 'content-type': 'text/html' }).end(ok ? PAGE : '<h1>Forbidden</h1>')
      }
      if (!holdSlow) return void answer()
      slowStarted?.()
      held.push(answer)
      return
    }
    if (req.url === '/needs') {
      const ok = (req.headers.cookie ?? '').includes(`token=${TOKEN}`)
      return void res.writeHead(ok ? 200 : 403, { 'content-type': 'text/html' }).end(ok ? PAGE : '<h1>Forbidden</h1>')
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

afterEach(async () => {
  await engine?.close()
  engine = null
  await rm(root, { recursive: true, force: true })
})

async function batch(capabilities: string[], extra: Record<string, unknown> = {}) {
  root = await mkdtemp(join(tmpdir(), 'w2l-egress-'))
  const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
  engine = createApiEngine({
    taskRoot: join(root, 'tasks'),
    networkPolicy: policy,
    accessGrant: accessGrantFromText(JSON.stringify({ tier: 'standard', capabilities })),
    channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy }).filter((channel) => channel.id === 'http'),
  })
  // maxAge asks the cache to keep pages: a page read with the session's cookies must not be kept.
  const { taskId } = await engine.startBatch({ urls: [`${origin}/start`, `${origin}/needs`], maxConcurrency: 1, maxAge: 3_600_000, ...extra } as Parameters<ApiEngine['startBatch']>[0])
  let report = await engine.getBatch(taskId)
  for (let i = 0; i < 200 && (report === null || ['pending', 'running'].includes(report.status)); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    report = await engine.getBatch(taskId)
  }
  const items = (await engine.getBatchItems(taskId, { limit: 10, debug: true }))!.items
  return { report, items: Object.fromEntries(items.map((item) => [new URL(item.url).pathname, item])) as Record<string, Record<string, unknown> & { status: string; trace?: { event: string; detail?: Record<string, unknown> }[] }> }
}

describe('egress_sessions: a batch keeps its cookies for its site', () => {
  it('sends the cookie the first page set to the second, only under a grant that names egress_sessions', async () => {
    const without = await batch([])
    expect(without.items['/needs']).toMatchObject({ status: 'failed' })
    // Without a session the first page is cached, as maxAge asks.
    expect(JSON.stringify(without.items['/start'])).toContain('cache_stored')
    await engine!.close(); engine = null; await rm(root, { recursive: true, force: true })

    const { report, items } = await batch(['egress_sessions'])
    expect(report).toMatchObject({ status: 'completed', completed: 2 })
    expect(items['/needs']).toMatchObject({ status: 'success' })
    const counts = items['/needs']!.trace?.find((event) => event.event === 'session_cookies')?.detail
    expect(counts).toMatchObject({ requestsWithCookies: 1 })
    // The same session served both pages of the task.
    expect(items['/start']!.trace?.find((event) => event.event === 'session_cookies')?.detail?.session).toBe(counts?.session)
    // The record names the session by id, never its cookies.
    expect(items['/needs']!.evidenceRecord?.access?.session).toEqual({ id: counts?.session })
    expect(JSON.stringify(items)).not.toContain(TOKEN)
    // No page read with the session was cached.
    expect(JSON.stringify(items)).not.toContain('cache_stored')
  })

  it('keeps a lockdown batch cache-only: nothing is fetched, a page not cached is a cache miss', async () => {
    hits.length = 0
    const { items } = await batch(['egress_sessions'], { lockdown: true })
    expect(hits).toEqual([])
    expect(items['/start']).toMatchObject({ status: 'failed', failureReason: 'cache_miss' })
  })
})

describe('egress_sessions: a resumed task goes on with its session', () => {
  it('keeps the cookies and the id across a restart, in a file only its owner reads, removed when the task ends', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-egress-'))
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const make = () => createApiEngine({
      taskRoot: join(root, 'tasks'),
      networkPolicy: policy,
      accessGrant: accessGrantFromText(JSON.stringify({ tier: 'standard', capabilities: ['egress_sessions'] })),
      channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy }).filter((channel) => channel.id === 'http'),
    })
    holdSlow = true
    const started = new Promise<void>((resolve) => { slowStarted = resolve })
    const first = make()
    const { taskId } = await first.startBatch({ urls: [`${origin}/start`, `${origin}/needs-slow`], maxConcurrency: 1 } as Parameters<ApiEngine['startBatch']>[0])
    await started
    const taskDir = join(root, 'tasks', taskId)
    const file = sessionFile(taskDir)
    expect(existsSync(file)).toBe(true)
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600)
    await first.close({ cancelActive: true })
    expect((await first.getBatch(taskId))?.status).toBe('paused')
    holdSlow = false
    for (const answer of held.splice(0)) answer()

    engine = make()
    let report = await engine.getBatch(taskId)
    for (let i = 0; i < 200 && (report === null || ['pending', 'running', 'paused'].includes(report.status)); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      report = await engine.getBatch(taskId)
    }
    expect(report).toMatchObject({ status: 'completed', completed: 2 })
    const items = (await engine.getBatchItems(taskId, { limit: 10, debug: true }))!.items as unknown as { url: string; status: string; trace?: { event: string; detail?: Record<string, unknown> }[] }[]
    const page = (path: string) => items.find((item) => new URL(item.url).pathname === path)!
    expect(page('/needs-slow').status).toBe('success')
    const sessionOf = (path: string) => page(path).trace?.find((event) => event.event === 'session_cookies')?.detail?.session
    expect(sessionOf('/needs-slow')).toBe(sessionOf('/start'))
    // The task has ended: its cookies are gone from the disk.
    expect(await sessionFileStays(taskDir)).toBe(false)
  })
})

describe('egress_sessions: the session file leaves with its task', () => {
  const grant = (capabilities: string[]) => accessGrantFromText(JSON.stringify({ tier: 'standard', capabilities }))
  const settle = async (taskId: string, done: string[]) => {
    let report = await engine!.getBatch(taskId)
    for (let i = 0; i < 200 && (report === null || !done.includes(report.status)); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      report = await engine!.getBatch(taskId)
    }
    return report
  }

  it('is gone before anyone hears that the task ended: the terminal event finds no session file', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-egress-'))
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      networkPolicy: policy,
      accessGrant: grant(['egress_sessions']),
      channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy }).filter((channel) => channel.id === 'http'),
    })
    const heard: { status: string; fileThere: boolean }[] = []
    let taskDir = ''
    const off = engine.jobEvents.on((event) => { if (event.type === 'terminal') heard.push({ status: event.status, fileThere: hasSessionFile(taskDir) }) })
    try {
      const { taskId } = await engine.startBatch({ urls: [`${origin}/start`, `${origin}/needs`], maxConcurrency: 1 } as Parameters<ApiEngine['startBatch']>[0])
      taskDir = join(root, 'tasks', taskId)
      await settle(taskId, ['completed', 'failed'])
      for (let i = 0; i < 100 && heard.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 20))
    } finally {
      off()
    }
    // A webhook receiver or an events stream hears of the end only once the cookies are off the disk.
    expect(heard).toEqual([{ status: 'completed', fileThere: false }])
  })

  it('stays gone when a page cancelled with its task stores cookies afterwards', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-egress-'))
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    let lateStarted!: () => void
    const late = new Promise<void>((resolve) => { lateStarted = resolve })
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      networkPolicy: policy,
      accessGrant: grant(['egress_sessions']),
      channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy }).filter((channel) => channel.id === 'http').map((channel) => ({
        ...channel,
        // A rung like the browser's: it goes on after the run stopped waiting, then leaves its cookies in the session.
        fetch: async (url, session, execution, options) => {
          if (!url.endsWith('/late')) return channel.fetch(url, session, execution, options)
          lateStarted()
          await new Promise<void>((resolve) => execution?.signal?.addEventListener('abort', () => resolve(), { once: true }))
          await new Promise((resolve) => setTimeout(resolve, 300))
          await execution?.cookieSession?.store(url, ['late=1; Path=/'])
          throw new Error('stopped')
        },
      })),
    })
    const { taskId } = await engine.startBatch({ urls: [`${origin}/start`, `${origin}/late`], maxConcurrency: 1 } as Parameters<ApiEngine['startBatch']>[0])
    await late
    const taskDir = join(root, 'tasks', taskId)
    const file = sessionFile(taskDir)
    expect(existsSync(file)).toBe(true)
    await engine.cancelBatch(taskId)
    await settle(taskId, ['cancelled'])
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(hasSessionFile(taskDir)).toBe(false)
  })

  it('is removed when the task ends on a server restarted without the grant', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-egress-'))
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const make = (capabilities: string[]) => createApiEngine({
      taskRoot: join(root, 'tasks'),
      networkPolicy: policy,
      accessGrant: grant(capabilities),
      channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy }).filter((channel) => channel.id === 'http'),
    })
    holdSlow = true
    const started = new Promise<void>((resolve) => { slowStarted = resolve })
    const first = make(['egress_sessions'])
    const { taskId } = await first.startBatch({ urls: [`${origin}/start`, `${origin}/needs-slow`], maxConcurrency: 1 } as Parameters<ApiEngine['startBatch']>[0])
    await started
    const taskDir = join(root, 'tasks', taskId)
    const file = sessionFile(taskDir)
    await first.close({ cancelActive: true })
    holdSlow = false
    for (const answer of held.splice(0)) answer()
    expect(existsSync(file)).toBe(true)
    engine = make([])
    expect(await settle(taskId, ['completed', 'failed'])).toMatchObject({ status: 'completed' })
    expect(await sessionFileStays(taskDir)).toBe(false)
  })
})
