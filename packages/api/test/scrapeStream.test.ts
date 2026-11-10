import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { RequestError, type ScrapeStage, type TraceEvent } from '@w2l/contracts'
import { W2L, W2LError } from '@w2l/sdk'
import { createApp, STAGE_STREAM_TYPE } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'
import type { ServerActivity } from '../src/activity.js'

/** `POST /v1/scrape` with `Accept: application/x-ndjson`: the scrape's stages as lines while it runs, then its answer. */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const PAGE = `<!doctype html><html><head><title>Survey</title></head><body><main><article><h1>Hourly survey</h1><p>${PROSE}</p></article></main></body></html>`
const ROBOTS_READ = { event: 'robots_checked', detail: { decision: 'allowed' } } as unknown as TraceEvent

describe('a scrape answered as a stream of its stages', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  /** A local site whose page is held back until `release` is called, and an engine on a task root of its own. */
  async function setup() {
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const server = createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
      void (req.url?.startsWith('/held') ? held : Promise.resolve()).then(() => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const taskRoot = await mkdtemp(join(tmpdir(), 'w2l-stream-'))
    const engine = createApiEngine({ taskRoot })
    cleanup.push(async () => {
      release()
      await engine.close({ cancelActive: true })
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(taskRoot, { recursive: true, force: true })
    })
    return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, engine, release }
  }

  const post = (app: ReturnType<typeof createApp>, body: unknown, accept?: string, signal?: AbortSignal) =>
    app.request('/v1/scrape', { method: 'POST', headers: { 'content-type': 'application/json', ...(accept === undefined ? {} : { accept }) }, body: JSON.stringify(body), ...(signal === undefined ? {} : { signal }) })
  const lines = async (response: Response): Promise<Array<Record<string, unknown>>> => (await response.text()).split('\n').filter((text) => text !== '').map((text) => JSON.parse(text) as Record<string, unknown>)
  /** An engine whose scrape does what `scrape` says, with the listener the route gave it for the call's trace. */
  const engineThat = (engine: ApiEngine, scrape: (tell: ((event: TraceEvent) => void) | undefined, signal: AbortSignal | undefined) => Promise<unknown>): ApiEngine =>
    ({ ...engine, scrape: ((_req, context) => scrape(context?.onTrace, context?.signal)) as ApiEngine['scrape'] })

  it('tells each stage as a line while the scrape runs, then the answer the plain call gives', async () => {
    const { origin, engine, release } = await setup()
    const app = createApp(engine)
    const response = await post(app, { url: `${origin}/held/page`, fastMode: true }, STAGE_STREAM_TYPE)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    // The robots line is there to read while the site still holds the page back.
    const reader = response.body!.getReader()
    const first = new TextDecoder().decode((await reader.read()).value)
    expect(first).toBe('{"type":"stage","stage":"robots","allowed":true}\n')
    release()
    let rest = ''
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; rest += new TextDecoder().decode(chunk.value) }
    const [page, result, ...more] = rest.split('\n').filter((text) => text !== '').map((text) => JSON.parse(text) as Record<string, unknown>)
    expect(more).toEqual([])
    expect(page).toEqual({ type: 'stage', stage: 'page' })
    expect(result).toMatchObject({ type: 'result', http: 200, body: { status: 'success', requestedUrl: `${origin}/held/page` } })
    // The answer is the body the plain call gives: the same fields.
    const plain = await (await post(app, { url: `${origin}/plain`, fastMode: true })).json() as Record<string, unknown>
    expect(Object.keys(result!.body as object).sort()).toEqual(Object.keys(plain).sort())
  })

  it('answers the plain call as it always did, whatever else Accept names', async () => {
    const { origin, engine } = await setup()
    const app = createApp(engine)
    for (const accept of [undefined, 'application/json', '*/*', 'text/event-stream']) {
      const response = await post(app, { url: `${origin}/page`, fastMode: true }, accept)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toMatch(/^application\/json/)
      expect((await response.json() as { status: string }).status).toBe('success')
    }
    // Among other types, and with a parameter, it is asked for all the same.
    const listed = await post(app, { url: `${origin}/listed`, fastMode: true }, 'application/json, Application/X-NDJSON;q=0.9')
    expect(listed.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8')
    expect((await lines(listed)).map((line) => line.type)).toEqual(['stage', 'stage', 'result'])
  })

  it('answers a call that ends before any stage as the plain call: its own status and body', async () => {
    const { origin, engine } = await setup()
    // Refused before it starts.
    const refused = await post(createApp(engine), { url: 'not a url' }, STAGE_STREAM_TYPE)
    expect(refused.status).toBe(400)
    expect(refused.headers.get('content-type')).toMatch(/^application\/json/)
    expect(await refused.json()).toMatchObject({ code: 'invalid_request' })
    // A scrape that tells no stage (one that starts in a browser), and one that fails before any.
    const silent = await post(createApp(engineThat(engine, async () => ({ status: 'success', lane: 'browser' }))), { url: `${origin}/page` }, STAGE_STREAM_TYPE)
    expect(silent.headers.get('content-type')).toMatch(/^application\/json/)
    expect(await silent.json()).toEqual({ status: 'success', lane: 'browser' })
    const failed = await post(createApp(engineThat(engine, async () => { throw new Error('the engine fell over') })), { url: `${origin}/page` }, STAGE_STREAM_TYPE)
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: 'internal error', code: 'internal_error' })
  })

  it('puts an error that comes after the first stage on the last line, with the status and body the plain call would answer', async () => {
    const { origin, engine } = await setup()
    const after = (error: Error) => createApp(engineThat(engine, async (tell) => { tell?.(ROBOTS_READ); await Promise.resolve(); throw error }))
    const internal = await post(after(new Error('the engine fell over')), { url: `${origin}/page` }, STAGE_STREAM_TYPE)
    expect(internal.status).toBe(200)
    expect(await lines(internal)).toEqual([
      { type: 'stage', stage: 'robots', allowed: true },
      { type: 'result', http: 500, body: { error: 'internal error', code: 'internal_error' } },
    ])
    const refused = await lines(await post(after(new RequestError('timeout must be an integer', 'invalid_request')), { url: `${origin}/page` }, STAGE_STREAM_TYPE))
    expect(refused.at(-1)).toEqual({ type: 'result', http: 400, body: { error: 'timeout must be an integer', code: 'invalid_request' } })
    // The same error, plain: the status and body the line carried.
    const plain = await post(after(new RequestError('timeout must be an integer', 'invalid_request')), { url: `${origin}/page` })
    expect([plain.status, await plain.json()]).toEqual([400, { error: 'timeout must be an integer', code: 'invalid_request' }])
  })

  it('ends the stream with a last line when the answer cannot be written as one, and says so on the log', async () => {
    const { origin, engine } = await setup()
    const logged: string[] = []
    const error = console.error
    console.error = (text: string) => { logged.push(text) }
    try {
      // An answer JSON cannot hold, and a thrown value that cannot be said.
      for (const scrape of [async () => ({ pages: 1n }), async () => { throw Object.create(null) }]) {
        const app = createApp(engineThat(engine, async (tell) => { tell?.(ROBOTS_READ); await Promise.resolve(); return scrape() }))
        expect(await lines(await post(app, { url: `${origin}/page` }, STAGE_STREAM_TYPE))).toEqual([
          { type: 'stage', stage: 'robots', allowed: true },
          { type: 'result', http: 500, body: { error: 'internal error', code: 'internal_error' } },
        ])
      }
    } finally { console.error = error }
    expect(logged).toHaveLength(2)
    expect(logged[0]).toContain('"path":"/v1/scrape"')
  })

  it('tells the stages to the stream and to the server\'s own listener alike', async () => {
    const { origin, engine } = await setup()
    const events: ServerActivity[] = []
    const response = await post(createApp(engine, { onActivity: (event) => { events.push(event) } }), { url: `${origin}/page`, fastMode: true }, STAGE_STREAM_TYPE)
    expect((await lines(response)).map((line) => line.stage ?? line.type)).toEqual(['robots', 'page', 'result'])
    expect(events.map((event) => event.type === 'call_stage' ? event.stage.stage : event.type)).toEqual(['call_started', 'robots', 'page', 'call_ended'])
  })

  it('is read by the SDK\'s scrape with onStage: the stages, then the answer or the error the plain call gives', async () => {
    const { origin, engine } = await setup()
    const sdkOn = (app: ReturnType<typeof createApp>) => new W2L({ baseUrl: 'http://api.test', token: '', fetch: ((input: RequestInfo | URL, init?: RequestInit) => app.request(String(input), init)) as typeof fetch })
    const stages: ScrapeStage[] = []
    const answer = await sdkOn(createApp(engine)).scrape(`${origin}/page`, { fastMode: true }, { onStage: (stage) => { stages.push(stage) } })
    expect(stages).toEqual([{ stage: 'robots', allowed: true }, { stage: 'page' }])
    expect(answer).toMatchObject({ status: 'success', requestedUrl: `${origin}/page` })
    // An error after the first stage is thrown as the plain call throws it.
    const failing = sdkOn(createApp(engineThat(engine, async (tell) => { tell?.(ROBOTS_READ); await Promise.resolve(); throw new RequestError('timeout must be an integer', 'invalid_request') })))
    const plain = await failing.scrape(`${origin}/page`).catch((error: unknown) => error) as W2LError
    const streamed = await failing.scrape(`${origin}/page`, {}, { onStage: () => {} }).catch((error: unknown) => error) as W2LError
    expect(streamed).toBeInstanceOf(W2LError)
    expect({ ...streamed, message: streamed.message }).toEqual({ ...plain, message: plain.message })
    expect(streamed.status).toBe(400)
  })

  it('ends the stream when the caller goes away, the scrape cancelled as the plain call\'s is', async () => {
    const { origin, engine } = await setup()
    let cancelled = false
    const app = createApp(engineThat(engine, (tell, signal) => new Promise((_resolve, reject) => {
      tell?.(ROBOTS_READ)
      signal?.addEventListener('abort', () => { cancelled = true; reject(new Error('cancelled')) }, { once: true })
    })))
    const controller = new AbortController()
    const response = await post(app, { url: `${origin}/page` }, STAGE_STREAM_TYPE, controller.signal)
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"stage":"robots"')
    const logged: string[] = []
    const error = console.error
    console.error = (text: string) => { logged.push(text) }
    try {
      controller.abort()
      await expect.poll(() => cancelled).toBe(true)
      // The stream ends with no last line, and the cancelled scrape is not logged as an error: the plain call logs none.
      let rest = ''
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; rest += new TextDecoder().decode(chunk.value) }
      expect(rest).toBe('')
    } finally { console.error = error }
    expect(logged).toEqual([])
  })
})
