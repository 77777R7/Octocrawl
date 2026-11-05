import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { localNetworkPolicy, parseBatchStartRequest, parseCrawlStartRequest } from '@w2l/contracts'
import { buildChannels } from '@w2l/bench'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

// A plain HTTP server: an https:// URL of its port fails at the handshake and its http:// twin answers, on a real engine.

const page = (path: string) => `<!doctype html><html><head><title>Page ${path}</title></head><body><main><article><h1>Page ${path}</h1>${path === '/' ? '<a href="/next">next</a>' : ''}<p>Page ${path}. ${'A site that never took up HTTPS, with enough text in its article for the extractor to call it a page. '.repeat(6)}</p></article></main></body></html>`

describe('a site with no working HTTPS, on a real engine', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  async function site(options: { hosted?: boolean; robots?: string } = {}): Promise<{ engine: ApiEngine; port: number; seen: string[] }> {
    const seen: string[] = []
    const server = createServer((req, res) => {
      seen.push(req.url ?? '/')
      if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end(options.robots ?? 'User-agent: *\nAllow: /\n'); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(req.url ?? '/'))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const root = await mkdtemp(join(tmpdir(), 'octocrawl-http-fallback-'))
    const policy = { ...localNetworkPolicy(), perHostMinDelayMs: 0 }
    const engine = createApiEngine({ taskRoot: root, networkPolicy: policy, workerCount: 2, resumeOnStart: false, hosted: options.hosted ?? false, channelsFor: (mode) => buildChannels(mode, { networkPolicy: policy, localSubjects: { browser_local: { fetch: async () => { throw new Error('these tests stay on HTTP') } } as never } }) })
    cleanup.push(async () => { await engine.close(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(root, { recursive: true, force: true }) })
    return { engine, port: (server.address() as AddressInfo).port, seen }
  }

  it('reads a scrape over http and records it in the Evidence Record', async () => {
    const { engine, port } = await site()
    const secure = `https://127.0.0.1:${port}/page`
    const answer = await engine.scrape({ url: secure, fastMode: true, debug: true }) as unknown as { status: string; markdown: string; warnings: Array<{ code: string; message: string }>; evidenceRecord: { requestedUrl: string; finalUrl: string; httpStatus: number } }
    expect(answer.status).toBe('success')
    expect(answer.markdown).toContain('never took up HTTPS')
    expect(answer.warnings.map((warning) => warning.code)).toContain('https_unavailable')
    expect(answer.evidenceRecord).toMatchObject({ requestedUrl: secure, finalUrl: `http://127.0.0.1:${port}/page`, httpStatus: 200 })
  })

  const wait = async (ready: () => Promise<boolean>) => { for (let i = 0; i < 300 && !(await ready()); i++) await new Promise((resolve) => setTimeout(resolve, 10)) }

  it('reads a batch\'s page over http, and the item says so', async () => {
    const { engine, port } = await site()
    const { taskId } = await engine.startBatch(parseBatchStartRequest({ urls: [`https://127.0.0.1:${port}/a`], fastMode: true }))
    await wait(async () => (await engine.getBatch(taskId))?.status === 'completed')
    const item = (await engine.getBatchItems(taskId))!.items[0] as unknown as { status: string; warnings: Array<{ code: string }>; evidenceRecord: { requestedUrl: string; finalUrl: string } }
    expect(item.status).toBe('success')
    expect(item.warnings.map((warning) => warning.code)).toContain('https_unavailable')
    expect(item.evidenceRecord.finalUrl).toBe(`http://127.0.0.1:${port}/a`)
  })

  it('follows a crawl on over http once its start page fell back', async () => {
    const { engine, port, seen } = await site()
    const { taskId } = await engine.startCrawl(parseCrawlStartRequest({ url: `https://127.0.0.1:${port}/`, maxPages: 3, fastMode: true }))
    await wait(async () => (await engine.getCrawl(taskId))?.status === 'completed')
    expect((await engine.getCrawl(taskId))?.status).toBe('completed')
    const urls = (await engine.getCrawlPages(taskId))!.items.map((item) => (item as unknown as { evidenceRecord: { finalUrl: string } }).evidenceRecord.finalUrl)
    expect(urls).toContain(`http://127.0.0.1:${port}/`)
    expect(urls).toContain(`http://127.0.0.1:${port}/next`)
    expect(seen).toContain('/next')
  })

  it('leaves a map alone', async () => {
    const { engine, port } = await site()
    const answer = await engine.map({ url: `https://127.0.0.1:${port}/`, ignoreRobotsTxt: true, sitemap: 'skip' } as never) as unknown as { links: string[] }
    expect(answer.links.filter((link) => String(link).startsWith('http:'))).toEqual([])
  })

  it('does not take a named URL\'s word to the http address on a local engine', async () => {
    const { engine, port, seen } = await site({ robots: 'User-agent: *\nDisallow: /\n' })
    const answer = await engine.scrape({ url: `https://127.0.0.1:${port}/page`, fastMode: true, debug: true }) as unknown as { status: string; failureReason: string }
    expect(answer).toMatchObject({ status: 'failed', failureReason: 'policy_denied' })
    expect(seen).not.toContain('/page')
  })

  it('obeys the http origin\'s robots.txt on a hosted engine', async () => {
    const { engine, port, seen } = await site({ hosted: true, robots: 'User-agent: *\nDisallow: /\n' })
    const answer = await engine.scrape({ url: `https://127.0.0.1:${port}/page`, fastMode: true, debug: true }) as unknown as { status: string; failureReason: string; evidenceRecord: { robotsDecision: { decision: string; unreachable: string | null } } }
    expect(answer).toMatchObject({ status: 'failed', failureReason: 'policy_denied', evidenceRecord: { robotsDecision: { decision: 'disallowed', unreachable: null } } })
    expect(seen).toEqual(['/robots.txt'])
  })
})
