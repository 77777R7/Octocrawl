import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { createServer as createNetServer, type AddressInfo } from 'node:net'
import { createApp } from '../src/app.js'
import { runApiServer } from '../src/cli.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'
import type { ServerActivity } from '../src/activity.js'

/** What a server tells of its work as it does it (ServerActivity), against a local site. */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const PAGE = `<!doctype html><html><head><title>Survey</title></head><body><main><article><h1>Hourly survey</h1><p>${PROSE}</p><p><a href="/next">Next</a></p></article></main></body></html>`

describe('what a server tells of its work', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  async function site(): Promise<{ origin: string; taskRoot: string }> {
    const server = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const taskRoot = await mkdtemp(join(tmpdir(), 'w2l-activity-'))
    cleanup.push(async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(taskRoot, { recursive: true, force: true })
    })
    return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, taskRoot }
  }

  async function setup(wrap: (engine: ApiEngine) => ApiEngine = (engine) => engine) {
    const { origin, taskRoot } = await site()
    const engine = createApiEngine({ taskRoot })
    cleanup.push(() => engine.close({ cancelActive: true }))
    const events: ServerActivity[] = []
    const post = (app: ReturnType<typeof createApp>, path: string, body: unknown) => app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { origin, engine, events, post, app: createApp(wrap(engine), { onActivity: (event) => { events.push(event) } }) }
  }

  it('tells a scrape call from its start to its end, with who called and the stages as they come', async () => {
    const { origin, events, post, app } = await setup()
    const response = await post(app, '/v1/scrape', { url: `${origin}/page`, fastMode: true, origin: 'mcp-claude-code@2.1.301' })
    expect(response.status).toBe(200)
    expect((await response.json() as { status: string }).status).toBe('success')
    expect(events).toEqual([
      { type: 'call_started', id: 1, kind: 'scrape', url: `${origin}/page`, origin: 'mcp-claude-code@2.1.301' },
      { type: 'call_stage', id: 1, stage: { stage: 'robots', allowed: true } },
      { type: 'call_stage', id: 1, stage: { stage: 'page' } },
      { type: 'call_ended', id: 1 },
    ])
    // The Firecrawl-shaped route is the same call.
    events.length = 0
    expect((await post(app, '/fc/v1/scrape', { url: `${origin}/fc` })).status).toBe(200)
    expect(events.map((event) => event.type)).toEqual(['call_started', 'call_stage', 'call_stage', 'call_ended'])
    expect(events[0]).toMatchObject({ id: 2, kind: 'scrape', url: `${origin}/fc` })
  })

  it('tells a map call\'s start and end: a map has no stages', async () => {
    const { origin, events, post, app } = await setup()
    expect((await post(app, '/v1/map', { url: `${origin}/`, sitemap: 'skip' })).status).toBe(200)
    expect(events).toEqual([{ type: 'call_started', id: 1, kind: 'map', url: `${origin}/` }, { type: 'call_ended', id: 1 }])
    events.length = 0
    expect((await post(app, '/fc/v1/map', { url: `${origin}/` })).status).toBe(200)
    expect(events.map((event) => event.type)).toEqual(['call_started', 'call_ended'])
  })

  it('gives each of two calls at once its own id, and each stage the id of its call', async () => {
    const { origin, events, post, app } = await setup()
    await Promise.all([post(app, '/v1/scrape', { url: `${origin}/one`, fastMode: true }), post(app, '/v1/scrape', { url: `${origin}/two`, fastMode: true })])
    const started = events.flatMap((event) => event.type === 'call_started' ? [event] : [])
    expect(started.map((event) => event.url).sort()).toEqual([`${origin}/one`, `${origin}/two`])
    expect(started.map((event) => event.id).sort()).toEqual([1, 2])
    for (const id of [1, 2]) {
      expect(events.filter((event) => 'id' in event && event.id === id).map((event) => event.type === 'call_stage' ? event.stage.stage : event.type)).toEqual(['call_started', 'robots', 'page', 'call_ended'])
    }
  })

  it('tells the end of a call that fails, and tells nothing of a request that is refused before it starts', async () => {
    const { origin, events, post, app } = await setup((engine) => ({ ...engine, scrape: async () => { throw new Error('the engine fell over') } }))
    expect((await post(app, '/v1/scrape', { url: `${origin}/page` })).status).toBe(500)
    expect(events).toEqual([{ type: 'call_started', id: 1, kind: 'scrape', url: `${origin}/page` }, { type: 'call_ended', id: 1 }])
    events.length = 0
    expect((await post(app, '/v1/scrape', { url: 'not a url' })).status).toBe(400)
    expect(events).toEqual([])
  })

  it('answers a call the same when the listener throws, and listens to no stage when nobody listens', async () => {
    const { origin, taskRoot } = await site()
    const engine = createApiEngine({ taskRoot })
    cleanup.push(() => engine.close({ cancelActive: true }))
    const contexts: unknown[] = []
    const recording: ApiEngine = { ...engine, scrape: (req, context, hooks) => { contexts.push(context); return engine.scrape(req, context, hooks) } }
    const body = JSON.stringify({ url: `${origin}/page`, fastMode: true })
    const request = { method: 'POST', headers: { 'content-type': 'application/json' }, body }
    const throwing = await createApp(recording, { onActivity: () => { throw new Error('the terminal went away') } }).request('/v1/scrape', request)
    expect(throwing.status).toBe(200)
    expect((await throwing.json() as { status: string }).status).toBe('success')
    const quiet = await createApp(recording).request('/v1/scrape', request)
    expect(quiet.status).toBe(200)
    // With a listener the call's trace is listened to; without one the engine gets the context it always got.
    expect(Object.keys(contexts[0] as object).sort()).toEqual(['onTrace', 'signal'])
    expect(Object.keys(contexts[1] as object)).toEqual(['signal'])
  })

  it('tells a batch from its start, a page at a time, to its end, when the server is run with a listener', async () => {
    const { origin, taskRoot } = await site()
    const probe = createNetServer()
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const { port } = probe.address() as AddressInfo
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    const events: ServerActivity[] = []
    const server = await runApiServer(['--port', String(port)], { W2L_TASK_ROOT: join(taskRoot, 'tasks'), W2L_SESSIONS_FILE: join(taskRoot, 'sessions.json') }, { signals: false, log: () => {}, onActivity: (event) => { events.push(event) } })
    cleanup.push(() => server.close())
    const started = await fetch(`${server.url}/v1/batches`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls: [`${origin}/a`, `${origin}/b`], fastMode: true }) })
    const { taskId } = await started.json() as { taskId: string }
    await expect.poll(() => events.at(-1), { timeout: 20_000 }).toEqual({ type: 'job_ended', taskId })
    expect(events).toEqual([
      { type: 'job_started', taskId, kind: 'batch' },
      { type: 'job_page', taskId, kind: 'batch' },
      { type: 'job_page', taskId, kind: 'batch' },
      { type: 'job_ended', taskId },
    ])
  })
})
