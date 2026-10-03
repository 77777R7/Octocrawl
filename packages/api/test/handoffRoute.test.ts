import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FetchResult } from '@w2l/contracts'
import { parseBatchHandoffRequest } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/** POST /v1/batches/:id/handoff and what a batch says of its stopped items, without a browser: the lane answers a captcha for /gate, a rate limit for /slow, content otherwise. */

function laneResult(url: string): FetchResult {
  const blockReason = url.endsWith('/gate') ? 'captcha' : url.endsWith('/slow') ? 'rate_limit' : null
  return {
    requestedUrl: url, status: blockReason === null ? 'success' : 'blocked', failureReason: null, blockReason, budgetExceeded: null, lane: 'http',
    evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: 'a'.repeat(64), artifacts: [], fetchedAt: new Date().toISOString() },
    compliance: null, trace: [], escalations: [], markdown: blockReason === null ? '# Page' : null, links: [], truncated: false, truncatedAt: null,
    usage: { wallMs: 1, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, contentTokens: 1, browserMs: null, externalCostUsd: null },
  } as unknown as FetchResult
}

describe('the handoff route', () => {
  let server: FixtureServer
  beforeAll(async () => { server = await startFixtureServer() })
  afterAll(async () => { await server.close() })
  let root: string
  let engine: ApiEngine | null = null
  afterEach(async () => {
    await engine?.close()
    engine = null
    await rm(root, { recursive: true, force: true })
  })

  async function setup(userChrome: boolean) {
    root = await mkdtemp(join(tmpdir(), 'w2l-handoff-route-'))
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      channelsFor: (mode) => [buildChannels(mode, { localSubjects: { http: { fetch: async (url: string) => laneResult(url) }, browser_local: { fetch: async () => { throw new Error('unused') } } } })[0]!],
      ...(userChrome ? { userChrome: { userDataDir: join(root, 'no-chrome') } } : {}),
    })
    const app = createApp(engine)
    const { taskId } = await engine.startBatch({ urls: [`${server.url}/gate`, `${server.url}/slow`, `${server.url}/ok`] } as never)
    for (let i = 0; i < 200; i++) {
      const report = await engine.getBatch(taskId)
      if (report?.status === 'completed') break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return { app, taskId }
  }
  const post = async (app: ReturnType<typeof createApp>, path: string, body?: string) => {
    const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body }) })
    return { status: res.status, body: await res.json() as Record<string, any> }
  }

  it('a server that hands pages to the person says which items wait for them, and the check is one a person gets through', async () => {
    const { app, taskId } = await setup(true)
    expect(await (await app.request(`/v1/batches/${taskId}`)).json()).toMatchObject({ status: 'completed', waitingForPerson: 1 })
    const items = (await (await app.request(`/v1/batches/${taskId}/items`)).json() as { items: Array<Record<string, any>> }).items
    expect(Object.fromEntries(items.map((item) => [new URL(item.url).pathname, item.handoff?.reason ?? null]))).toEqual({ '/gate': 'captcha_required', '/slow': null, '/ok': null })
    expect(items.find((item) => item.url.endsWith('/gate'))!.handoff.rationale).toContain(`POST /v1/batches/${taskId}/handoff`)
    // Chrome is not reachable here: the answer says how to turn remote debugging on.
    const refused = await post(app, `/v1/batches/${taskId}/handoff`)
    expect(refused).toMatchObject({ status: 409, body: { code: 'conflict', error: expect.stringContaining('chrome://inspect/#remote-debugging') } })
  })

  it('a server that does not says so, and its items carry no handoff', async () => {
    const { app, taskId } = await setup(false)
    const report = await (await app.request(`/v1/batches/${taskId}`)).json() as Record<string, unknown>
    expect(report.waitingForPerson).toBeUndefined()
    const items = (await (await app.request(`/v1/batches/${taskId}/items`)).json() as { items: Array<Record<string, unknown>> }).items
    expect(items.every((item) => item.handoff === undefined)).toBe(true)
    expect(await post(app, `/v1/batches/${taskId}/handoff`)).toMatchObject({ status: 409, body: { error: expect.stringContaining('does not hand pages to a person') } })
  })

  it('refuses a malformed request, and answers 404 for a batch it has not', async () => {
    const { app, taskId } = await setup(true)
    expect(await post(app, `/v1/batches/${taskId}/handoff`, JSON.stringify({ waitMs: 5 }))).toMatchObject({ status: 400 })
    expect(await post(app, `/v1/batches/${taskId}/handoff`, JSON.stringify({ urls: [] }))).toMatchObject({ status: 400, body: { error: 'unsupported handoff option: urls' } })
    expect(await post(app, '/v1/batches/nope/handoff')).toMatchObject({ status: 404 })
  })
})

describe('parseBatchHandoffRequest', () => {
  it('takes a wait of 10 s to 30 min, or none', () => {
    expect(parseBatchHandoffRequest(undefined)).toEqual({})
    expect(parseBatchHandoffRequest({ waitMs: 60_000 })).toEqual({ waitMs: 60_000 })
    expect(() => parseBatchHandoffRequest({ waitMs: 1_800_001 })).toThrow('waitMs must be an integer from 10000 to 1800000')
    expect(() => parseBatchHandoffRequest([])).toThrow('body must be a JSON object')
  })
})
