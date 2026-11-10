import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { TraceEvent } from '@w2l/contracts'
import { createApiEngine, type ApiEngineOptions } from '../src/engine.js'
import { scrapeStages, type ScrapeStage } from '../src/stages.js'

/** The stages a scrape tells while it runs (scrapeStages on the engine's onTrace), against a local site. */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const PAGE = `<!doctype html><html><head><title>Survey</title></head><body><main><article><h1>Hourly survey</h1><p>${PROSE}</p></article></main></body></html>`

describe('the stages a scrape tells while it runs', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  async function setup(robots: { status: number; body?: string }, options: Partial<ApiEngineOptions> = {}) {
    const order: string[] = []
    const server = createServer((req, res) => {
      order.push(req.url ?? '')
      if (req.url === '/robots.txt') { res.writeHead(robots.status, { 'content-type': 'text/plain' }).end(robots.body ?? ''); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const taskRoot = await mkdtemp(join(tmpdir(), 'w2l-stages-'))
    const engine = createApiEngine({ taskRoot, ...options })
    cleanup.push(async () => {
      await engine.close({ cancelActive: true })
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(taskRoot, { recursive: true, force: true })
    })
    /** One scrape of /private/page on the HTTP lane alone, with the stages it told and what the site had been asked for at each. */
    const scrape = async () => {
      const stages: ScrapeStage[] = []
      const asked: string[][] = []
      const result = await engine.scrape({ url: `${origin}/private/page`, fastMode: true }, { onTrace: scrapeStages((stage) => { stages.push(stage); asked.push([...order]) }) })
      return { stages, asked, result }
    }
    return { scrape, origin, engine }
  }

  it('tells robots.txt, then the page, each once and as they happen', async () => {
    const { scrape } = await setup({ status: 200, body: 'User-agent: *\nAllow: /\n' })
    const { stages, asked, result } = await scrape()
    expect(result.status).toBe('success')
    expect(stages).toEqual([{ stage: 'robots', allowed: true }, { stage: 'page' }])
    // The robots stage is told before the page is asked for, not with the result.
    expect(asked[0]).toEqual(['/robots.txt'])
    expect(asked[1]).toEqual(['/robots.txt', '/private/page'])
  })

  it('says a disallow was set aside when a local server fetches the URL the request named', async () => {
    const { scrape } = await setup({ status: 200, body: 'User-agent: *\nDisallow: /private/\n' })
    const { stages, result } = await scrape()
    expect(result.status).toBe('success')
    expect(result.warnings?.map((warning) => warning.code)).toContain('robots_overridden')
    expect(stages).toEqual([{ stage: 'robots', allowed: true, overridden: true }, { stage: 'page' }])
  })

  it('tells a refusal and no page when robots.txt is obeyed', async () => {
    const { scrape } = await setup({ status: 200, body: 'User-agent: *\nDisallow: /private/\n' }, { allowRobotsOverride: false })
    const { stages, asked, result } = await scrape()
    expect(result.failureReason).toBe('policy_denied')
    expect(stages).toEqual([{ stage: 'robots', allowed: false }])
    expect(asked[0]).toEqual(['/robots.txt'])
  })

  it('tells an unreadable robots.txt as a refusal that says so', async () => {
    const { scrape } = await setup({ status: 503 }, { allowRobotsOverride: false })
    const { stages, result } = await scrape()
    expect(result.failureReason).toBe('policy_denied')
    expect(stages).toEqual([{ stage: 'robots', allowed: false, unreachable: true }])
  })

  it('answers the same with a listener as without one', async () => {
    const { scrape, origin, engine } = await setup({ status: 200, body: 'User-agent: *\nAllow: /\n' })
    const heard = (await scrape()).result
    const plain = await engine.scrape({ url: `${origin}/private/page`, fastMode: true })
    expect(Object.keys(heard).sort()).toEqual(Object.keys(plain).sort())
    expect(heard).toMatchObject({ status: plain.status, markdown: plain.markdown, failureReason: plain.failureReason })
  })
})

describe('scrapeStages', () => {
  const event = (name: string, detail?: Record<string, unknown>): TraceEvent => ({ at: 0, lane: 'http', event: name, ...(detail === undefined ? {} : { detail }) }) as TraceEvent

  it('tells each stage once, whatever a later rung repeats, and is not stopped by a listener that throws', async () => {
    const stages: ScrapeStage[] = []
    const listen = scrapeStages((stage) => { stages.push(stage); throw new Error('a listener error stays here') })
    for (const name of ['robots_checked', 'extract', 'robots_checked', 'extract']) listen(event(name, { decision: 'allowed' }))
    await Promise.resolve()
    expect(stages).toEqual([{ stage: 'robots', allowed: true }, { stage: 'page' }])
  })

  it('waits for the end of the turn to say whether a disallow stood', async () => {
    const stages: ScrapeStage[] = []
    const listen = scrapeStages((stage) => stages.push(stage))
    listen(event('robots_checked', { decision: 'disallowed' }))
    listen(event('robots_disallowed'))
    expect(stages).toEqual([])
    await Promise.resolve()
    expect(stages).toEqual([{ stage: 'robots', allowed: false }])
  })
})
