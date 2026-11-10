import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Agent, getGlobalDispatcher, setGlobalDispatcher, type Dispatcher } from 'undici'
import { W2L, W2LError, type ScrapeStage } from '../src/index.js'

/** scrape's `onStage`: the stage stream of POST /v1/scrape read by the SDK (docs/scrape-options.md). */

const RESULT = { status: 'success', markdown: '# Tides — höjd' }
const NDJSON = { 'content-type': 'application/x-ndjson; charset=utf-8' }
const stream = (...lines: unknown[]): string => lines.map((line) => `${typeof line === 'string' ? line : JSON.stringify(line)}\n`).join('')

/** A client whose fetch answers every request with `answer`, and the requests it made. */
function client(answer: () => Response) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = []
  const sdk = new W2L({
    baseUrl: 'http://127.0.0.1:8787', token: '',
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) })
      return answer()
    }) as typeof fetch,
  })
  return { sdk, calls }
}
/** A response whose body arrives in pieces of `size` bytes, wherever that cuts a line or a character. */
function inPieces(text: string, size: number, headers: Record<string, string> = NDJSON): Response {
  const bytes = new TextEncoder().encode(text)
  let at = 0
  return new Response(new ReadableStream<Uint8Array>({ pull(controller) { if (at >= bytes.length) controller.close(); else controller.enqueue(bytes.slice(at, at += size)) } }), { status: 200, headers })
}

describe('scrape with onStage', () => {
  it('asks for the stage stream only when a listener is given, and is the plain call otherwise', async () => {
    const { sdk, calls } = client(() => new Response(JSON.stringify(RESULT), { status: 200, headers: { 'content-type': 'application/json' } }))
    await sdk.scrape('https://example.com/')
    await sdk.scrape('https://example.com/', {}, { onStage: () => {} })
    expect(calls.map((call) => call.headers)).toEqual([
      { 'content-type': 'application/json' },
      { 'content-type': 'application/json', accept: 'application/x-ndjson, application/json' },
    ])
    // The request body is the same either way.
    expect(calls[1]!.body).toEqual(calls[0]!.body)
  })

  it('tells each stage as its line arrives, then returns the answer, however the stream is cut into pieces', async () => {
    const body = stream({ type: 'stage', stage: 'robots', allowed: true }, { type: 'stage', stage: 'page' }, { type: 'result', http: 200, body: RESULT })
    for (const size of [1, 7, 64, 10_000]) {
      const stages: ScrapeStage[] = []
      const { sdk } = client(() => inPieces(body, size))
      expect(await sdk.scrape('https://example.com/', {}, { onStage: (stage) => { stages.push(stage) } }), `pieces of ${size}`).toEqual(RESULT)
      expect(stages).toEqual([{ stage: 'robots', allowed: true }, { stage: 'page' }])
    }
    // A stage is told before the answer is there: the listener hears robots while the stream is still open.
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const encoder = new TextEncoder()
    const { sdk } = client(() => new Response(new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(stream({ type: 'stage', stage: 'robots', allowed: false, overridden: true })))
        await held
        controller.enqueue(encoder.encode(stream({ type: 'result', http: 200, body: RESULT })))
        controller.close()
      },
    }), { status: 200, headers: NDJSON }))
    let heard: ScrapeStage | null = null
    const answer = sdk.scrape('https://example.com/', {}, { onStage: (stage) => { heard = stage } })
    await expect.poll(() => heard).toEqual({ stage: 'robots', allowed: false, overridden: true })
    release()
    expect(await answer).toEqual(RESULT)
  })

  it('returns the plain answer of a server that tells no stages, and never calls the listener', async () => {
    let told = 0
    const { sdk } = client(() => new Response(JSON.stringify(RESULT), { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' } }))
    expect(await sdk.scrape('https://example.com/', {}, { onStage: () => { told++ } })).toEqual(RESULT)
    expect(told).toBe(0)
  })

  it('throws the plain call\'s error for a request refused before the stream, and for an error on the stream\'s last line', async () => {
    const refusal = { error: 'timeout must be an integer', code: 'invalid_request', agentHints: ['send timeout as milliseconds'] }
    const before = client(() => new Response(JSON.stringify(refusal), { status: 400, headers: { 'content-type': 'application/json', 'retry-after': '7' } }))
    const plain = await before.sdk.scrape('https://example.com/').catch((error: unknown) => error) as W2LError
    const refused = await before.sdk.scrape('https://example.com/', {}, { onStage: () => {} }).catch((error: unknown) => error) as W2LError
    expect(refused).toBeInstanceOf(W2LError)
    expect({ ...refused, message: refused.message }).toEqual({ ...plain, message: plain.message })
    expect(refused.retryAfterMs).toBe(7_000)

    // After the first stage the HTTP status is 200: the last line carries the status and body the plain call would have had.
    const stages: ScrapeStage[] = []
    const after = client(() => inPieces(stream({ type: 'stage', stage: 'robots', allowed: true }, { type: 'result', http: 400, body: refusal }), 16))
    const late = await after.sdk.scrape('https://example.com/', {}, { onStage: (stage) => { stages.push(stage) } }).catch((error: unknown) => error) as W2LError
    expect(stages).toEqual([{ stage: 'robots', allowed: true }])
    expect(late).toBeInstanceOf(W2LError)
    expect({ status: late.status, code: late.code, method: late.method, path: late.path, body: late.body, agentHints: late.agentHints, retryAfterMs: late.retryAfterMs })
      .toEqual({ status: 400, code: 'invalid_request', method: 'POST', path: '/v1/scrape', body: refusal, agentHints: ['send timeout as milliseconds'], retryAfterMs: null })
    expect(late.message).toBe(plain.message)
  })

  it('throws as a cut connection does when the stream ends before its result', async () => {
    const { sdk } = client(() => inPieces(stream({ type: 'stage', stage: 'robots', allowed: true }, { type: 'stage', stage: 'page' }), 16))
    const error = await sdk.scrape('https://example.com/', {}, { onStage: () => {} }).catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(TypeError)
    expect((error as Error).message).toBe('POST /v1/scrape failed: the server\'s answer ended before the scrape\'s result')
  })

  it('returns the answer whatever the listener does, and passes over lines it does not know', async () => {
    const body = stream('', 'not json', '[1,2]', { type: 'note', text: 'from a newer server' }, { type: 'stage', stage: 'robots', allowed: true }, { type: 'result', http: 200, body: RESULT }, { type: 'stage', stage: 'page' })
    let told = 0
    const { sdk } = client(() => inPieces(body, 5))
    expect(await sdk.scrape('https://example.com/', {}, { onStage: () => { told++; throw new Error('the progress bar broke') } })).toEqual(RESULT)
    // The result ends the reading: a line after it is not told.
    expect(told).toBe(1)
    // A listener that answers with a promise that rejects is ignored as well: nothing is left unhandled.
    const unhandled: unknown[] = []
    const note = (reason: unknown) => { unhandled.push(reason) }
    process.on('unhandledRejection', note)
    try {
      const second = client(() => inPieces(body, 5))
      expect(await second.sdk.scrape('https://example.com/', {}, { onStage: (async () => { throw new Error('the progress bar broke later') }) as () => void })).toEqual(RESULT)
      await new Promise((resolve) => setTimeout(resolve, 20))
    } finally { process.off('unhandledRejection', note) }
    expect(unhandled).toEqual([])
  })

  it('reads a result of many megabytes that comes in small pieces, a last line with no line end, and CRLF line ends', async () => {
    const large = { status: 'success', markdown: 'tide '.repeat(1_200_000) }
    const { sdk } = client(() => inPieces(`{"type":"stage","stage":"page"}\r\n${JSON.stringify({ type: 'result', http: 200, body: large })}`, 4_096))
    const stages: ScrapeStage[] = []
    const started = Date.now()
    const answer = await sdk.scrape('https://example.com/', {}, { onStage: (stage) => { stages.push(stage) } })
    expect(stages).toEqual([{ stage: 'page' }])
    expect((answer as unknown as typeof large).markdown.length).toBe(6_000_000)
    // Not a bound on speed: reading it piece by piece from the start each time took minutes.
    expect(Date.now() - started).toBeLessThan(20_000)
  })

  it('rejects with the caller\'s abort when the call is cancelled mid-stream', async () => {
    const controller = new AbortController()
    const { sdk } = client(() => new Response(new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new TextEncoder().encode('{"type":"stage","stage":"robots","allowed":true}\n'))
        controller.signal.addEventListener('abort', () => stream.error(controller.signal.reason), { once: true })
      },
    }), { status: 200, headers: NDJSON }))
    const reason = new Error('the person pressed stop')
    const answer = sdk.scrape('https://example.com/', {}, { signal: controller.signal, onStage: () => { controller.abort(reason) } })
    await expect(answer).rejects.toBe(reason)
  })

  it('reads a body that comes whole, from a fetch that gives no stream', async () => {
    const stages: ScrapeStage[] = []
    const text = stream({ type: 'stage', stage: 'page' }, { type: 'result', http: 200, body: RESULT })
    const { sdk } = client(() => ({ status: 200, headers: new Headers(NDJSON), body: null, text: async () => text }) as unknown as Response)
    expect(await sdk.scrape('https://example.com/', {}, { onStage: (stage) => { stages.push(stage) } })).toEqual(RESULT)
    expect(stages).toEqual([{ stage: 'page' }])
  })

  it('waits for the stream\'s next part as long as it waits for the plain answer: the scrape\'s timeout plus 30 s', async () => {
    // The server sends the robots line at once and the result 1.5 s later; the process's dispatcher gives a body 1 s between parts.
    const api = createServer((req, res) => {
      req.resume()
      res.writeHead(200, NDJSON)
      res.write(stream({ type: 'stage', stage: 'robots', allowed: true }))
      setTimeout(() => res.end(stream({ type: 'result', http: 200, body: RESULT })), 1_500)
    })
    await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve))
    const original = getGlobalDispatcher()
    const agent = new Agent({ headersTimeout: 1_000, bodyTimeout: 1_000 })
    const waits: Array<[number | null | undefined, number | null | undefined]> = []
    setGlobalDispatcher({ dispatch: (options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler) => { waits.push([options.headersTimeout, options.bodyTimeout]); return agent.dispatch(options, handler) } } as unknown as Dispatcher)
    try {
      const sdk = new W2L({ baseUrl: `http://127.0.0.1:${(api.address() as AddressInfo).port}`, token: '' })
      expect(await sdk.scrape('https://example.com/', { timeout: 1_000 }, { onStage: () => {} })).toEqual(RESULT)
      // Read in the person's Chrome, it waits for them: no limit.
      await sdk.scrape('https://example.com/', { lane: 'my-browser' }, { onStage: () => {} })
      expect(waits).toEqual([[31_000, 31_000], [0, 0]])
    } finally {
      setGlobalDispatcher(original)
      await agent.close()
      api.closeAllConnections()
      await new Promise<void>((resolve) => api.close(() => resolve()))
    }
  })
})
