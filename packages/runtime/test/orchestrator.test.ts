import { describe, expect, it } from 'vitest'
import { DEFAULT_CRAWL_BUDGET, type CrawlReport, type FetchResult, type ScrapeAtom, type ScrapeOutcome, type SitemapFileRecord, type SitemapLoadRequest, type SitemapLoadResult, type SitemapSource } from '@w2l/contracts'
import { CrawlOrchestrator, type CrawlClock } from '../src/orchestrator.js'
import { crawlReportFromStore } from '../src/crawlReport.js'
import { MemoryTaskStore } from '../src/memoryStore.js'
import type { TaskStore } from '../src/taskStore.js'

class FakeClock implements CrawlClock {
  t = 1_000
  now(): number {
    return this.t
  }
  async wait(ms: number): Promise<void> {
    this.t += ms
  }
}

function page(
  url: string,
  over: { markdown?: string; links?: readonly string[]; hash?: string; wallMs?: number; cost?: number } = {},
): FetchResult {
  const markdown = over.markdown ?? `MAIN ${url}`
  return {
    requestedUrl: url,
    status: 'success',
    failureReason: null,
    blockReason: null,
    budgetExceeded: null,
    lane: 'http',
    escalations: [],
    markdown,
    links: over.links ?? [],
    truncated: false,
    truncatedAt: null,
    compliance: null,
    evidence: {
      finalUrl: url,
      httpStatus: 200,
      redirectChain: [],
      contentType: 'text/html',
      rawBodySha256: over.hash ?? url,
      artifacts: [],
    },
    usage: {
      wallMs: over.wallMs ?? 5,
      bytesWire: 10,
      bytesDecompressed: 10,
      requestCount: 1,
      attemptCount: 1,
      contentTokens: 4,
      browserMs: 0,
      externalCostUsd: over.cost ?? null,
    },
    trace: [],
  }
}

class FakeAtom implements ScrapeAtom {
  readonly fetches: string[] = []
  constructor(private readonly pages: ReadonlyMap<string, ScrapeOutcome>) {}

  async scrape(url: string): Promise<ScrapeOutcome> {
    this.fetches.push(url)
    const hit = this.pages.get(url)
    if (hit === undefined) throw new Error(`fake atom has no page for ${url}`)
    return hit
  }

  async close(): Promise<void> {}
}

class ConcurrentAtom implements ScrapeAtom {
  active = 0
  maxActive = 0
  constructor(private readonly pages: ReadonlyMap<string, ScrapeOutcome>) {}
  async scrape(url: string): Promise<ScrapeOutcome> {
    this.active++
    this.maxActive = Math.max(this.maxActive, this.active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    this.active--
    const hit = this.pages.get(url)
    if (hit === undefined) throw new Error(`fake atom has no page for ${url}`)
    return hit
  }
  async close(): Promise<void> {}
}

function outcome(url: string, links: readonly string[], hash = url): ScrapeOutcome {
  const result = page(url, { links, hash })
  return { result, links }
}

const SITEMAP_FILE = 'https://fixture.test/sitemap.xml'

/** A sitemap source that lists the given URLs from one file, or throws; it records every load request. */
class FakeSitemapSource implements SitemapSource {
  readonly loads: SitemapLoadRequest[] = []
  closed = 0
  constructor(private readonly urls: readonly string[], private readonly failure: Error | null = null) {}
  async load(request: SitemapLoadRequest): Promise<SitemapLoadResult> {
    this.loads.push(request)
    if (this.failure !== null) throw this.failure
    const file: SitemapFileRecord = { url: SITEMAP_FILE, finalUrl: SITEMAP_FILE, status: 200, contentType: 'application/xml', bytes: 120, sha256: 'f'.repeat(64), kind: 'urlset', entries: this.urls.length, robots: 'allowed', proxyUsed: false, error: null }
    return { identity: { mode: 'standard', userAgent: 'test' }, sources: ['robots'], files: [file], urls: this.urls.map((url) => ({ url, file: SITEMAP_FILE })), truncated: null }
  }
  async close(): Promise<void> { this.closed++ }
}

function runWith(atom: FakeAtom, spec: Parameters<CrawlOrchestrator['run']>[0], store: TaskStore = new MemoryTaskStore()) {
  const clock = new FakeClock()
  const orchestrator = new CrawlOrchestrator({ store, atom, clock })
  return { store, atom, clock, orchestrator, go: () => orchestrator.run(spec) }
}

/** A first attempt that service shutdown interrupts once its first page is stored. */
async function interruptedAfterFirstPage(atom: ScrapeAtom, spec: Parameters<CrawlOrchestrator['run']>[0], store: TaskStore): Promise<CrawlReport> {
  const shutdown = new AbortController()
  const put = store.putStep.bind(store)
  store.putStep = async (step) => {
    await put(step)
    shutdown.abort(new DOMException('service shutdown', 'ShutdownError'))
  }
  try {
    return await new CrawlOrchestrator({ store, atom, clock: new FakeClock(), shutdownSignal: shutdown.signal }).run(spec)
  } finally {
    store.putStep = put
  }
}

// The seed is the site's root: a crawl stays in the seed's path subtree by default (frontier.test.ts covers the rule).
const SEED = 'https://fixture.test/'
const ITEM_A = 'https://fixture.test/a'
const ITEM_B = 'https://fixture.test/b'

describe('CrawlOrchestrator with a fake scrape atom', () => {
  it('scrapes the seed, enqueues only contentful links, and does not import Playwright', async () => {
    const atom = new FakeAtom(
      new Map([
        [SEED, outcome(SEED, [ITEM_A, ITEM_B])],
        [ITEM_A, outcome(ITEM_A, [])],
        [ITEM_B, outcome(ITEM_B, [])],
      ]),
    )
    const { go } = runWith(atom, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl' })
    const report = await go()
    expect(report.status).toBe('completed')
    expect(report.pagesFetched).toBe(3)
    expect(report.loopDetected).toBe(false)
    expect(atom.fetches).toEqual([SEED, ITEM_A, ITEM_B])
    const runtime = await import('../src/orchestrator.js')
    expect(Object.keys(runtime).sort()).toEqual(['CrawlOrchestrator', 'systemClock'])
  })

  it('does not enqueue links from a non-contentful page', async () => {
    const blocked: FetchResult = {
      ...page(SEED, { links: [ITEM_A] }),
      status: 'blocked',
      blockReason: 'captcha',
      markdown: null,
    }
    const atom = new FakeAtom(new Map([[SEED, { result: blocked, links: [ITEM_A] }]]))
    const { go } = runWith(atom, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl' })
    const report = await go()
    expect(report.pagesFetched).toBe(1)
    expect(atom.fetches).toEqual([SEED])
  })

  it('stops at --max-pages with budget_exceeded: pages', async () => {
    const atom = new FakeAtom(
      new Map([
        [SEED, outcome(SEED, [ITEM_A, ITEM_B])],
        [ITEM_A, outcome(ITEM_A, [])],
        [ITEM_B, outcome(ITEM_B, [])],
      ]),
    )
    const { store, go } = runWith(atom, {
      seedUrl: SEED,
      taskDir: '/tmp/w2l-crawl',
      budget: { maxPages: 1, maxWallMs: null, maxCostUsd: null, maxTokens: null },
    })
    const report = await go()
    expect(report.pagesFetched).toBe(1)
    expect(report.budgetExceeded).toBe('pages')
    expect(atom.fetches).toEqual([SEED])
    const attempt = await store.getAttempt(report.attemptId)
    expect(attempt?.budgetExceeded).toBe('pages')
  })

  it('stops on time and cost budgets', async () => {
    const atom = new FakeAtom(new Map([[SEED, outcome(SEED, [])]]))
    const timed = runWith(atom, {
      seedUrl: SEED,
      taskDir: '/tmp/w2l-crawl',
      budget: { maxPages: null, maxWallMs: 0, maxCostUsd: null, maxTokens: null },
    })
    const timeReport = await timed.go()
    expect(timeReport.budgetExceeded).toBe('time')
    expect(timeReport.pagesFetched).toBe(0)

    const twoPage = new FakeAtom(
      new Map([
        [SEED, { result: page(SEED, { cost: 5, links: [ITEM_A] }), links: [ITEM_A] }],
        [ITEM_A, outcome(ITEM_A, [])],
      ]),
    )
    const capped = runWith(twoPage, {
      seedUrl: SEED,
      taskDir: '/tmp/w2l-crawl',
      budget: { maxPages: null, maxWallMs: null, maxCostUsd: 5, maxTokens: null },
    })
    const cappedReport = await capped.go()
    expect(cappedReport.pagesFetched).toBe(1)
    expect(cappedReport.budgetExceeded).toBe('cost')
    expect(twoPage.fetches).toEqual([SEED])
  })

  it('marks a later URL with the same body as duplicate and keeps crawling', async () => {
    // The crawl asked for the html formats: a duplicate gives them up with its Markdown.
    const repeated = outcome(ITEM_A, [SEED], 'same-body')
    const atom = new FakeAtom(
      new Map([
        [SEED, outcome(SEED, [ITEM_A, ITEM_B], 'same-body')],
        [ITEM_A, { ...repeated, result: { ...repeated.result, html: '<main>same body</main>', rawHtml: '<html><body><main>same body</main></body></html>' } }],
        [ITEM_B, outcome(ITEM_B, [], 'other')],
      ]),
    )
    const { store, go } = runWith(atom, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl' })
    const report = await go()
    expect(report.loopDetected).toBe(false)
    expect(report.status).toBe('completed')
    expect(atom.fetches).toEqual([SEED, ITEM_A, ITEM_B])
    const steps = await store.listSteps(report.taskId, report.attemptId)
    const dup = steps.find((s) => s.canonicalUrl === ITEM_A)
    expect(dup?.status).toBe('duplicate')
    expect(dup?.result?.status).toBe('duplicate')
    expect(dup?.contentHash).toBe('same-body')
    expect(dup?.result?.failureReason).toBeNull()
    expect(dup?.result?.markdown).toBeNull()
    expect(dup?.result).not.toHaveProperty('html')
    expect(dup?.result).not.toHaveProperty('rawHtml')
    // The page's own links stay on the record (an empty list would claim it has none); the crawl does not follow them.
    expect(dup?.result?.links).toEqual([SEED])
    expect(dup?.result?.trace.some((t) => t.event === 'duplicate_content')).toBe(true)
    const other = steps.find((s) => s.canonicalUrl === ITEM_B)
    expect(other?.status).toBe('success')
    // The duplicate is counted, and left out of the pages consumers read unless they ask for it.
    expect(report.discovery).toMatchObject({ duplicateContent: 1, offered: 2, enqueued: 2 })
    const listed = (query: { includeDuplicates?: boolean }) => store.listStepsPage(report.taskId, { limit: 10, kind: 'pages', ...query }).then((page) => page.steps.map((s) => s.canonicalUrl).sort())
    expect(await listed({})).toEqual([ITEM_B, SEED].sort())
    expect(await listed({ includeDuplicates: true })).toEqual([ITEM_A, ITEM_B, SEED].sort())
  })

  it('reports what became of each page\'s links, with samples, in its trace and on the attempt', async () => {
    const HUB = 'https://fixture.test/list/'
    const PAGE_1 = 'https://fixture.test/list/?page=1'
    const ITEM = 'https://fixture.test/list/item'
    const atom = new FakeAtom(new Map([
      [HUB, outcome(HUB, [PAGE_1, 'https://fixture.test/list/?page=2', PAGE_1, 'https://other.test/x', 'https://fixture.test/about', ITEM])],
      [ITEM, outcome(ITEM, [])],
    ]))
    const { store, go } = runWith(atom, { seedUrl: HUB, taskDir: '/tmp/w2l-crawl', ignoreQueryParameters: true })
    const report = await go()
    // The query variants fold into the seed (the first is fetched as the seed itself), the repeat is a plain duplicate,
    // other.test is outside the host scope and /about outside the seed's /list/ subtree.
    expect(atom.fetches).toEqual([HUB, ITEM])
    const discovery = { offered: 6, enqueued: 1, duplicate: 1, collapsed: 2, hostDenied: 1, subtreeDenied: 1, pathDenied: 0, depthDenied: 0, duplicateContent: 0, sitemap: null }
    expect(report.discovery).toEqual(discovery)
    expect((await store.getAttempt(report.attemptId))?.discovery).toEqual(discovery)
    expect((await store.getTask(report.taskId))?.crawl).toMatchObject({ ignoreQueryParameters: true, crawlEntireDomain: false })
    const steps = await store.listSteps(report.taskId, report.attemptId)
    const seed = steps.find((s) => s.canonicalUrl === HUB)!
    expect(seed.result?.trace[0]).toMatchObject({ event: 'discovered', detail: { via: 'seed', from: null } })
    expect(seed.result?.trace.at(-1)).toEqual({ at: 5, lane: 'http', event: 'links_offered', detail: {
      offered: 6, enqueued: 1, duplicate: 1, collapsed: 2, hostDenied: 1, subtreeDenied: 1, pathDenied: 0, depthDenied: 0,
      samples: { collapsed: [{ url: PAGE_1, into: HUB }, { url: 'https://fixture.test/list/?page=2', into: HUB }], hostDenied: ['https://other.test/x'] },
    } })
    const item = steps.find((s) => s.canonicalUrl === ITEM)!
    expect(item.result?.trace[0]).toMatchObject({ event: 'discovered', detail: { via: 'link', from: HUB } })
    expect(item.result?.trace.at(-1)).toMatchObject({ event: 'links_offered', detail: { offered: 0 } })
  })

  it('restores the queue on resume and refetches by default', async () => {
    const pages = new Map([
      [SEED, outcome(SEED, [ITEM_A])],
      [ITEM_A, outcome(ITEM_A, [])],
    ])
    const store = new MemoryTaskStore()
    const firstAtom = new FakeAtom(pages)
    const firstReport = await interruptedAfterFirstPage(firstAtom, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl' }, store)
    expect(firstReport.status).toBe('paused')
    expect(firstAtom.fetches).toEqual([SEED])

    const resumeAtom = new FakeAtom(pages)
    const resumed = runWith(resumeAtom, {
      seedUrl: SEED,
      taskDir: '/tmp/w2l-crawl',
      resumeFrom: firstReport.taskId,
    }, store)
    const resumeReport = await resumed.go()
    expect(resumeReport.taskId).toBe(firstReport.taskId)
    expect(resumeReport.attemptId).not.toBe(firstReport.attemptId)
    expect(resumeAtom.fetches).toEqual([SEED, ITEM_A])
    expect(resumeReport.cachedPages).toBe(0)
  })

  it('never fetches filtered links and keeps the path filters of a SQLite task on resume', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { SqliteTaskStore } = await import('../src/sqliteStore.js')
    const dir = await mkdtemp(join(tmpdir(), 'w2l-paths-'))
    const ITEM_C = 'https://fixture.test/c'
    // B is excluded and C is not included: the fake atom has no page for either.
    const pages = new Map([[SEED, outcome(SEED, [ITEM_A, ITEM_B, ITEM_C])], [ITEM_A, outcome(ITEM_A, [])]])
    try {
      const firstStore = SqliteTaskStore.open(dir)
      const firstAtom = new FakeAtom(pages)
      const firstReport = await interruptedAfterFirstPage(firstAtom, { seedUrl: SEED, taskDir: dir, includePaths: ['^/[ab]$'], excludePaths: ['^/b$'] }, firstStore)
      expect(firstAtom.fetches).toEqual([SEED])
      await firstStore.close()

      const resumeStore = SqliteTaskStore.open(dir)
      const resumeAtom = new FakeAtom(pages)
      const resumed = await runWith(resumeAtom, { seedUrl: SEED, taskDir: dir, resumeFrom: firstReport.taskId }, resumeStore).go()
      expect(resumed.status).toBe('completed')
      expect(resumeAtom.fetches).toEqual([SEED, ITEM_A])
      expect((await resumeStore.getTask(firstReport.taskId))?.crawl).toEqual({
        maxDepth: null, allowlistedDomains: [], includePaths: ['^/[ab]$'], excludePaths: ['^/b$'],
        regexOnFullURL: false, ignoreQueryParameters: false, deduplicateSimilarURLs: true, crawlEntireDomain: false, allowSubdomains: false, allowExternalLinks: false,
        // No SitemapSource was given: the task says it read no sitemap, and takes the worker count.
        sitemap: 'skip', maxConcurrency: null,
      })
      await resumeStore.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('skips the fake fetch for cached pages only with --use-cached, and marks them', async () => {
    const pages = new Map([
      [SEED, outcome(SEED, [ITEM_A])],
      [ITEM_A, outcome(ITEM_A, [])],
    ])
    const store = new MemoryTaskStore()
    const firstReport = await interruptedAfterFirstPage(new FakeAtom(pages), { seedUrl: SEED, taskDir: '/tmp/w2l-crawl' }, store)

    const resumeAtom = new FakeAtom(pages)
    const resumed = runWith(resumeAtom, {
      seedUrl: SEED,
      taskDir: '/tmp/w2l-crawl',
      resumeFrom: firstReport.taskId,
      useCached: true,
    }, store)
    const resumeReport = await resumed.go()
    expect(resumeAtom.fetches).toEqual([ITEM_A])
    expect(resumeReport.cachedPages).toBe(1)
    expect(resumeReport.pagesFetched).toBe(2)
    const steps = await store.listSteps(resumeReport.taskId, resumeReport.attemptId)
    const cached = steps.find((s) => s.canonicalUrl === SEED)
    expect(cached?.cached).toBe(true)
    expect(cached?.result?.markdown).toContain('MAIN')
  })

  it('records a URL whose scrape throws as its own failed item and finishes the rest', async () => {
    // ITEM_A has no page, so the fake atom throws for it; ITEM_B throws a
    // timeout of its own. Neither may stop the crawl or leave it running.
    const pages = new Map([[SEED, outcome(SEED, [ITEM_A, ITEM_B])]])
    const atom: ScrapeAtom = {
      async scrape(url) {
        if (url === ITEM_B) throw new DOMException('Execution deadline exceeded', 'TimeoutError')
        const hit = pages.get(url)
        if (hit === undefined) throw new Error(`fake atom has no page for ${url}`)
        return hit
      },
      async close() {},
    }
    const store = new MemoryTaskStore()
    const report = await new CrawlOrchestrator({ store, atom, clock: new FakeClock() }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl' })
    expect(report.status).toBe('completed')
    expect(report.pagesFetched).toBe(3)
    expect((await store.listAttempts(report.taskId))[0]?.status).toBe('completed')
    const steps = await store.listSteps(report.taskId, report.attemptId)
    const failedA = steps.find((s) => s.canonicalUrl === ITEM_A)
    expect(failedA?.status).toBe('failed')
    expect(failedA?.result).toMatchObject({ status: 'failed', failureReason: 'internal_error', markdown: null })
    expect(failedA?.result?.trace).toContainEqual(expect.objectContaining({ event: 'scrape_error', detail: expect.objectContaining({ error: expect.stringMatching(/fake atom has no page/) }) }))
    expect(steps.find((s) => s.canonicalUrl === ITEM_B)?.result).toMatchObject({ status: 'failed', failureReason: 'timeout' })
  })

  it('runs bounded workers instead of awaiting every page serially', async () => {
    const pages = new Map<string, ScrapeOutcome>([[SEED, outcome(SEED, [ITEM_A, ITEM_B])], [ITEM_A, outcome(ITEM_A, [])], [ITEM_B, outcome(ITEM_B, [])]])
    const atom = new ConcurrentAtom(pages)
    const clock = new FakeClock()
    const report = await new CrawlOrchestrator({ store: new MemoryTaskStore(), atom, clock, workerCount: 2, perHostMinDelayMs: 0 }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl' })
    expect(report.pagesFetched).toBe(3)
    expect(atom.maxActive).toBe(2)
  })

  it('lowers its workers to the task\'s maxConcurrency and never raises them above the service\'s count', async () => {
    const pages = () => new Map<string, ScrapeOutcome>([[SEED, outcome(SEED, [ITEM_A, ITEM_B])], [ITEM_A, outcome(ITEM_A, [])], [ITEM_B, outcome(ITEM_B, [])]])
    const capped = new ConcurrentAtom(pages())
    const store = new MemoryTaskStore()
    const one = await new CrawlOrchestrator({ store, atom: capped, clock: new FakeClock(), workerCount: 4, perHostMinDelayMs: 0 }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl', maxConcurrency: 1 })
    expect(one.pagesFetched).toBe(3)
    expect(capped.maxActive).toBe(1)
    expect((await store.getTask(one.taskId))?.crawl).toMatchObject({ maxConcurrency: 1 })
    const wide = new ConcurrentAtom(pages())
    const two = await new CrawlOrchestrator({ store: new MemoryTaskStore(), atom: wide, clock: new FakeClock(), workerCount: 2, perHostMinDelayMs: 0 }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl', maxConcurrency: 8 })
    expect(two.pagesFetched).toBe(3)
    expect(wide.maxActive).toBe(2)
  })

  it('does not oversubscribe maxPages while workers are in flight', async () => {
    const pages = new Map<string, ScrapeOutcome>([
      [SEED, outcome(SEED, [ITEM_A, ITEM_B])],
      [ITEM_A, outcome(ITEM_A, [])],
      [ITEM_B, outcome(ITEM_B, [])],
    ])
    const atom = new ConcurrentAtom(pages)
    const report = await new CrawlOrchestrator({
      store: new MemoryTaskStore(),
      atom,
      clock: new FakeClock(),
      workerCount: 4,
      perHostMinDelayMs: 0,
    }).run({
      seedUrl: SEED,
      taskDir: '/tmp/w2l-crawl',
      budget: { maxPages: 2, maxWallMs: null, maxCostUsd: null, maxTokens: null },
    })
    expect(report.pagesFetched).toBe(2)
  })

  it('accounts for ladder attempts and keeps unknown meters explicit', async () => {
    const atom: ScrapeAtom = {
      async scrape(url) {
        return {
          result: page(url, { cost: 2 }),
          links: [],
          audit: {
            channelsTried: ['http', 'provider'],
            ladderTrace: [],
            summary: {
              channelsTried: ['http', 'provider'],
              attempts: [],
              wallMs: 2,
              browserMs: 0,
              bytesWire: null,
              bytesDecompressed: 0,
              requestCount: 2,
              attemptCount: 2,
              contentTokens: null,
              externalCostUsd: null,
              externalCost: { knownSubtotal: 2, unknown: true },
              contentTokenMeter: { knownSubtotal: 4, unknown: true },
              artifacts: [],
            },
          },
        }
      },
      async close() {},
    }
    const report = await new CrawlOrchestrator({ store: new MemoryTaskStore(), atom, clock: new FakeClock() }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl' })
    expect(report.costUsd).toBeNull()
    expect(report.costUnknown).toBe(true)
    expect(report.contentTokensUnknown).toBe(true)
  })

  it('writes failed when the store throws after a scrape', async () => {
    const store = new MemoryTaskStore()
    const original = store.putStep.bind(store)
    store.putStep = async (step) => {
      await original(step)
      throw new Error('checkpoint write failed')
    }
    const atom = new FakeAtom(new Map([[SEED, outcome(SEED, [])]]))
    const { go } = runWith(atom, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl' }, store)
    await expect(go()).rejects.toThrow(/checkpoint write failed/)
    const tasks = await store.listTasks()
    expect(tasks[0]?.status).toBe('failed')
    const attempts = await store.listAttempts(tasks[0]!.id)
    expect(attempts[0]?.status).toBe('failed')
  })

  it('reseeds the seed URL when resume finds no contentful checkpoint', async () => {
    const store = new MemoryTaskStore()
    const startedAt = '2026-09-18T00:00:00.000Z'
    await store.putTask({
      id: 'task-kill',
      seedUrl: SEED,
      taskDir: '/tmp/w2l-crawl',
      mode: 'standard',
      status: 'running',
      budget: DEFAULT_CRAWL_BUDGET,
      createdAt: startedAt,
      updatedAt: startedAt,
    })
    await store.putAttempt({
      id: 'attempt-kill',
      taskId: 'task-kill',
      status: 'running',
      startedAt,
      endedAt: null,
      pagesFetched: 0,
      wallMs: 0,
      costUsd: 0,
      contentTokens: 0,
      budgetExceeded: null,
    })

    const atom = new FakeAtom(
      new Map([
        [SEED, outcome(SEED, [ITEM_A])],
        [ITEM_A, outcome(ITEM_A, [])],
      ]),
    )
    const resumed = runWith(
      atom,
      { seedUrl: SEED, taskDir: '/tmp/w2l-crawl', resumeFrom: 'task-kill' },
      store,
    )
    const report = await resumed.go()
    expect(report.taskId).toBe('task-kill')
    expect(report.status).toBe('completed')
    expect(report.loopDetected).toBe(false)
    expect(atom.fetches).toEqual([SEED, ITEM_A])
    expect(report.pagesFetched).toBe(2)
    const attempts = await store.listAttempts('task-kill')
    const killed = attempts.find((row) => row.id === 'attempt-kill')
    expect(killed?.status).toBe('interrupted')
    expect(killed?.endedAt).not.toBeNull()
    expect(report.attemptId).not.toBe('attempt-kill')
    const resumedAttempt = attempts.find((row) => row.id === report.attemptId)
    expect(resumedAttempt?.recoveredFromAttemptId).toBe('attempt-kill')
  })
})

describe('CrawlOrchestrator sitemap modes', () => {
  const sitemapRun = (atom: FakeAtom, source: SitemapSource | undefined, spec: Partial<Parameters<CrawlOrchestrator['run']>[0]>) => {
    const store = new MemoryTaskStore()
    const orchestrator = new CrawlOrchestrator({ store, atom, clock: new FakeClock(), workerCount: 1, ...(source === undefined ? {} : { sitemapSource: source }) })
    return { store, go: () => orchestrator.run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl', ...spec }) }
  }

  it('include: queues the sitemap\'s entries after the seed and before the seed\'s links, and records the load', async () => {
    const atom = new FakeAtom(new Map([[SEED, outcome(SEED, [ITEM_A])], [ITEM_A, outcome(ITEM_A, [])], [ITEM_B, outcome(ITEM_B, [])]]))
    const source = new FakeSitemapSource([ITEM_B, SEED])
    const { store, go } = sitemapRun(atom, source, { budget: { ...DEFAULT_CRAWL_BUDGET, maxPages: 5 } })
    const report = await go()
    expect(report.status).toBe('completed')
    expect(atom.fetches).toEqual([SEED, ITEM_B, ITEM_A])
    expect(source.loads).toEqual([{ seedUrl: SEED, maxUrls: 5, maxFiles: 20 }])
    expect(source.closed).toBe(1)
    // The seed's own entry is a duplicate of the seed; the other entry and the seed's link were enqueued.
    expect(report.discovery).toMatchObject({ offered: 3, enqueued: 2, duplicate: 1, sitemap: { mode: 'include', sources: ['robots'], listed: 2, enqueued: 1, truncated: null, error: null } })
    expect(report.discovery?.sitemap?.files).toEqual([expect.objectContaining({ url: SITEMAP_FILE, kind: 'urlset', entries: 2 })])
    expect((await store.getAttempt(report.attemptId))?.discovery?.sitemap?.mode).toBe('include')
    expect((await store.getTask(report.taskId))?.crawl).toMatchObject({ sitemap: 'include' })
    const steps = await store.listSteps(report.taskId, report.attemptId)
    expect(steps.find((s) => s.canonicalUrl === ITEM_B)?.result?.trace[0]).toMatchObject({ event: 'discovered', detail: { via: 'sitemap', from: SITEMAP_FILE } })
    expect(steps.find((s) => s.canonicalUrl === ITEM_B)?.depth).toBe(1)
    expect(steps.find((s) => s.canonicalUrl === ITEM_A)?.result?.trace[0]).toMatchObject({ event: 'discovered', detail: { via: 'link', from: SEED } })
  })

  it('only: crawls the seed and the sitemap\'s entries, never a page link, and skip never asks the source', async () => {
    const atom = new FakeAtom(new Map([[SEED, outcome(SEED, [ITEM_A])], [ITEM_B, outcome(ITEM_B, [])]]))
    const source = new FakeSitemapSource([ITEM_B])
    const { store, go } = sitemapRun(atom, source, { sitemap: 'only' })
    const report = await go()
    expect(report.status).toBe('completed')
    expect(atom.fetches).toEqual([SEED, ITEM_B])
    expect(report.discovery).toMatchObject({ offered: 1, enqueued: 1, sitemap: { mode: 'only', listed: 1, enqueued: 1 } })
    const seed = (await store.listSteps(report.taskId, report.attemptId)).find((s) => s.canonicalUrl === SEED)!
    expect(seed.result?.links).toEqual([ITEM_A])
    expect(seed.result?.trace.some((event) => event.event === 'links_offered')).toBe(false)

    const skipping = new FakeSitemapSource([ITEM_B])
    const skipped = sitemapRun(new FakeAtom(new Map([[SEED, outcome(SEED, [])]])), skipping, { sitemap: 'skip' })
    const skipReport = await skipped.go()
    expect(skipping.loads).toEqual([])
    expect(skipReport.discovery?.sitemap).toBeNull()
    expect((await skipped.store.getTask(skipReport.taskId))?.crawl).toMatchObject({ sitemap: 'skip' })
  })

  it('offers entries under a link\'s rules (maxDepth 0 drops them) and records a load that throws without failing the crawl', async () => {
    const dropped = new FakeSitemapSource([ITEM_B, 'https://other.test/x'])
    const shallow = sitemapRun(new FakeAtom(new Map([[SEED, outcome(SEED, [])]])), dropped, { maxDepth: 0 })
    const report = await shallow.go()
    expect(report.pagesFetched).toBe(1)
    expect(report.discovery).toMatchObject({ offered: 2, enqueued: 0, depthDenied: 2, sitemap: { listed: 2, enqueued: 0 } })

    const failing = new FakeSitemapSource([], new Error('sitemap host unreachable'))
    const atom = new FakeAtom(new Map([[SEED, outcome(SEED, [ITEM_A])], [ITEM_A, outcome(ITEM_A, [])]]))
    const failed = await sitemapRun(atom, failing, {}).go()
    expect(failed.status).toBe('completed')
    expect(atom.fetches).toEqual([SEED, ITEM_A])
    expect(failed.discovery?.sitemap).toEqual({ mode: 'include', sources: [], files: [], listed: 0, enqueued: 0, truncated: null, error: 'Error: sitemap host unreachable' })
    expect(failing.closed).toBe(1)
  })
})

describe('CrawlOrchestrator task options, budget and politeness', () => {
  it('keeps the page budget per task: a resumed crawl never exceeds maxPages', async () => {
    const pages = new Map([[SEED, outcome(SEED, [ITEM_A, ITEM_B])], [ITEM_A, outcome(ITEM_A, [])], [ITEM_B, outcome(ITEM_B, [])]])
    const store = new MemoryTaskStore()
    const first = await interruptedAfterFirstPage(new FakeAtom(pages), { seedUrl: SEED, taskDir: '/tmp/w2l-crawl', budget: { ...DEFAULT_CRAWL_BUDGET, maxPages: 2 } }, store)
    expect(first.status).toBe('paused')
    // The resume names no budget; the task keeps its own. Refetching the seed costs no new page.
    const resumeAtom = new FakeAtom(pages)
    const resumed = await runWith(resumeAtom, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl', resumeFrom: first.taskId }, store).go()
    expect(resumeAtom.fetches).toEqual([SEED, ITEM_A])
    expect(resumed).toMatchObject({ status: 'completed', budgetExceeded: 'pages', pagesFetched: 2 })
    expect(new Set((await store.listSteps(first.taskId)).map((step) => step.canonicalUrl)).size).toBe(2)
  })

  it('resumes with the depth and host limits the task was started with', async () => {
    const OTHER = 'https://other.test/page'
    const DEEP = 'https://fixture.test/deep'
    const pages = new Map([[SEED, outcome(SEED, [ITEM_A, OTHER])], [ITEM_A, outcome(ITEM_A, [DEEP])], [OTHER, outcome(OTHER, [])], [DEEP, outcome(DEEP, [])]])
    const store = new MemoryTaskStore()
    const first = await interruptedAfterFirstPage(new FakeAtom(pages), { seedUrl: SEED, taskDir: '/tmp/w2l-crawl', maxDepth: 1, allowlistedDomains: ['fixture.test', 'other.test'] }, store)
    expect((await store.getTask(first.taskId))?.crawl).toMatchObject({ maxDepth: 1, allowlistedDomains: ['fixture.test', 'other.test'] })
    const resumeAtom = new FakeAtom(pages)
    await runWith(resumeAtom, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl', resumeFrom: first.taskId }, store).go()
    expect([...resumeAtom.fetches].sort()).toEqual([SEED, ITEM_A, OTHER].sort())
  })

  it('persists the page count while the crawl runs', async () => {
    const store = new MemoryTaskStore()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let blocked!: () => void
    const waiting = new Promise<void>((resolve) => { blocked = resolve })
    const atom: ScrapeAtom = {
      async scrape(url) {
        if (url === ITEM_A) { blocked(); await gate }
        return outcome(url, url === SEED ? [ITEM_A] : [])
      },
      async close() {},
    }
    const run = new CrawlOrchestrator({ store, atom, clock: new FakeClock() }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl' })
    await waiting
    const task = (await store.listTasks())[0]!
    expect(await crawlReportFromStore(store, task.id)).toMatchObject({ status: 'running', pagesFetched: 1 })
    release()
    expect(await run).toMatchObject({ status: 'completed', pagesFetched: 2 })
  })

  it('follows links on the host the seed redirected to, also after a resume', async () => {
    const MOVED = 'https://moved.test/'
    const MOVED_A = 'https://moved.test/a'
    const redirected: ScrapeOutcome = { result: { ...page(SEED, { links: [MOVED_A] }), evidence: { ...page(SEED).evidence, finalUrl: MOVED } }, links: [MOVED_A] }
    const pages = new Map<string, ScrapeOutcome>([[SEED, redirected], [MOVED_A, outcome(MOVED_A, [])]])
    const fresh = new FakeAtom(pages)
    await runWith(fresh, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl' }).go()
    expect(fresh.fetches).toEqual([SEED, MOVED_A])

    // A resume that reuses the stored seed page still knows where the seed went.
    const store = new MemoryTaskStore()
    const first = await interruptedAfterFirstPage(new FakeAtom(pages), { seedUrl: SEED, taskDir: '/tmp/w2l-crawl' }, store)
    const resumeAtom = new FakeAtom(pages)
    await runWith(resumeAtom, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl', resumeFrom: first.taskId, useCached: true }, store).go()
    expect(resumeAtom.fetches).toEqual([MOVED_A])
  })

  it('records the politeness delay applied before each fetched page, robots.txt Crawl-delay included', async () => {
    const pages = new Map<string, ScrapeOutcome>([
      [SEED, { ...outcome(SEED, [ITEM_A]), crawlDelayMs: 2_000 }],
      [ITEM_A, { ...outcome(ITEM_A, []), crawlDelayMs: 2_000 }],
    ])
    const store = new MemoryTaskStore()
    const report = await new CrawlOrchestrator({ store, atom: new FakeAtom(pages), clock: new FakeClock(), perHostMinDelayMs: 250, workerCount: 1 }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl' })
    const delays = new Map((await store.listSteps(report.taskId)).map((step) => [step.canonicalUrl, step.result?.trace.find((event) => event.event === 'crawl_delay')?.detail]))
    expect(delays.get(SEED)).toEqual({ host: 'fixture.test', startedAt: new Date(1_000).toISOString(), previousStartedAt: null, observedDelayMs: null, requiredDelayMs: 250, robotsCrawlDelayMs: null })
    expect(delays.get(ITEM_A)).toEqual({ host: 'fixture.test', startedAt: new Date(3_000).toISOString(), previousStartedAt: new Date(1_000).toISOString(), observedDelayMs: 2_000, requiredDelayMs: 2_000, robotsCrawlDelayMs: 2_000 })
  })
})

describe('CrawlOrchestrator execution lifecycle', () => {
  function waitingAtom() {
    let started!: () => void
    const active = new Promise<void>(resolve => { started = resolve })
    let seenSignal: AbortSignal | undefined
    let seenDeadline: number | undefined
    let closed = false
    const atom: ScrapeAtom = {
      async scrape(_url, context) {
        seenSignal = context?.signal
        seenDeadline = context?.deadlineAt
        started()
        return new Promise((_resolve, reject) => {
          context?.signal?.addEventListener('abort', () => reject(context.signal!.reason), { once: true })
        })
      },
      async close() { closed = true },
    }
    return { atom, active, signal: () => seenSignal, deadline: () => seenDeadline, closed: () => closed }
  }

  it('aborts active work and wakes idle workers on explicit cancellation', async () => {
    const store = new MemoryTaskStore()
    const pending = waitingAtom()
    const controller = new AbortController()
    const run = new CrawlOrchestrator({ store, atom: pending.atom, signal: controller.signal, workerCount: 4 }).run({ seedUrl: SEED, taskDir: '/tmp/lifecycle' })
    await pending.active
    controller.abort()
    const report = await run
    expect(report.status).toBe('cancelled')
    expect(pending.signal()?.aborted).toBe(true)
    expect(pending.closed()).toBe(true)
    expect((await store.getAttempt(report.attemptId))?.status).toBe('cancelled')
    expect(await store.listSteps(report.taskId)).toEqual([])
  })

  it('wall deadline aborts a live request and records a time budget instead of failure', async () => {
    const store = new MemoryTaskStore()
    const pending = waitingAtom()
    const started = Date.now()
    const report = await new CrawlOrchestrator({ store, atom: pending.atom, workerCount: 4 }).run({ seedUrl: SEED, taskDir: '/tmp/lifecycle', budget: { maxWallMs: 80, maxPages: null, maxCostUsd: null, maxTokens: null } })
    expect(report.status).toBe('completed')
    expect(report.budgetExceeded).toBe('time')
    expect(report.pagesFetched).toBe(0)
    expect(pending.deadline()).toBeGreaterThanOrEqual(started + 80)
    expect(pending.signal()?.aborted).toBe(true)
    expect(Date.now() - started).toBeLessThan(1_000)
    expect((await store.getAttempt(report.attemptId))?.status).toBe('completed')
  })

  it('interrupts a long frontier politeness wait without fetching another page', async () => {
    const store = new MemoryTaskStore()
    const controller = new AbortController()
    const atom = new FakeAtom(new Map([[SEED, outcome(SEED, [ITEM_A])]]))
    const run = new CrawlOrchestrator({ store, atom, signal: controller.signal, perHostMinDelayMs: 60_000, workerCount: 1 }).run({ seedUrl: SEED, taskDir: '/tmp/lifecycle', budget: { ...DEFAULT_CRAWL_BUDGET, maxWallMs: null } })
    await expect.poll(async () => (await store.listTasks()).length && (await store.listSteps((await store.listTasks())[0]!.id)).length).toBe(1)
    const started = Date.now()
    controller.abort()
    const report = await run
    expect(report.status).toBe('cancelled')
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(atom.fetches).toEqual([SEED])
  })

  it('service shutdown checkpoints paused/interrupted and permits resume', async () => {
    const store = new MemoryTaskStore()
    const shutdown = new AbortController()
    const pending = waitingAtom()
    const run = new CrawlOrchestrator({ store, atom: pending.atom, shutdownSignal: shutdown.signal }).run({ seedUrl: SEED, taskDir: '/tmp/lifecycle' })
    await pending.active
    shutdown.abort(new DOMException('service shutdown', 'ShutdownError'))
    const report = await run
    expect(report.status).toBe('paused')
    expect((await store.getAttempt(report.attemptId))?.status).toBe('interrupted')
    const resumed = await new CrawlOrchestrator({ store, atom: new FakeAtom(new Map([[SEED, outcome(SEED, [])]])) }).run({ seedUrl: SEED, taskDir: '/tmp/lifecycle', resumeFrom: report.taskId })
    expect(resumed.status).toBe('completed')
    expect(resumed.taskId).toBe(report.taskId)
  })

  it('observes another SQLite connection cancelling an in-flight request', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { SqliteTaskStore } = await import('../src/sqliteStore.js')
    const dir = await mkdtemp(join(tmpdir(), 'w2l-cancel-'))
    const local = SqliteTaskStore.open(dir)
    const other = SqliteTaskStore.open(dir)
    try {
      const pending = waitingAtom()
      const run = new CrawlOrchestrator({ store: local, atom: pending.atom }).run({ seedUrl: SEED, taskDir: dir })
      await pending.active
      const task = (await other.listTasks())[0]!
      await other.putTask({ ...task, status: 'cancelled', updatedAt: new Date().toISOString() })
      const report = await run
      expect(report.status).toBe('cancelled')
      expect(pending.signal()?.aborted).toBe(true)
      expect((await other.getAttempt(report.attemptId))?.status).toBe('cancelled')
      expect(await other.listSteps(task.id)).toEqual([])
    } finally { await local.close(); await other.close(); await rm(dir, { recursive: true, force: true }) }
  })
})
