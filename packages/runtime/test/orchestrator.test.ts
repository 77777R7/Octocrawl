import { describe, expect, it } from 'vitest'
import { carryPaidCalls, DEFAULT_CRAWL_BUDGET, type CrawlReport, type ExecutionContext, type FetchResult, type ListPageRead, type ScrapeAtom, type ScrapeOutcome, type SitemapFileRecord, type SitemapLoadRequest, type SitemapLoadResult, type SitemapSource } from '@w2l/contracts'
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

  it('calls onStep once per persisted step, in the order the steps are written, after the step and the attempt counters', async () => {
    const clock = new FakeClock()
    const pages = new Map([[SEED, outcome(SEED, [ITEM_A, ITEM_B])], [ITEM_A, outcome(ITEM_A, [])], [ITEM_B, outcome(ITEM_B, [])]])
    // Each fetch moves the clock, so the steps' createdAt order is the order they were written.
    const atom: ScrapeAtom = { scrape: async (url) => { clock.t += 10; const hit = pages.get(url); if (hit === undefined) throw new Error(`no page for ${url}`); return hit }, close: async () => {} }
    const store = new MemoryTaskStore()
    const seen: Array<{ id: string; status: string; persisted: boolean; pagesFetched: number }> = []
    const orchestrator = new CrawlOrchestrator({ store, atom, clock, workerCount: 1, onStep: async (step) => {
      const persisted = await store.getStep(step.id)
      const attempt = await store.getAttempt(step.attemptId)
      seen.push({ id: step.id, status: step.status, persisted: persisted !== null && persisted.status === step.status, pagesFetched: attempt?.pagesFetched ?? -1 })
    } })
    const report = await orchestrator.run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl' })
    expect(report.pagesFetched).toBe(3)
    const steps = await store.listSteps(report.taskId)
    expect(seen.map((entry) => entry.id)).toEqual(steps.map((step) => step.id))
    expect(seen).toEqual(steps.map((step, index) => ({ id: step.id, status: 'success', persisted: true, pagesFetched: index + 1 })))
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
    // The crawl asked for every format a page read as content carries: a duplicate gives them all up with its Markdown.
    const formats = {
      html: '<main>same body</main>',
      rawHtml: '<html><body><main>same body</main></body></html>',
      images: ['https://fixture.test/media/1.jpg'],
      attributes: [{ selector: 'main a', attribute: 'href', values: ['/a'] }],
      screenshot: { contentType: 'image/png' as const, width: 1280, height: 800, fullPage: false, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, quality: null, bytes: 3, sha256: 'a'.repeat(64), path: null, base64: 'iVBO' },
      list: { itemSelector: 'li', fields: ['name'], records: [{ values: { name: 'same' }, missing: [], source: { url: SEED, page: 1, index: 0 } }], pages: 1, incomplete: 0, truncated: false, csv: 'name,source_url,page,index\r\n', csvSha256: 'c'.repeat(64) },
    }
    const first = outcome(SEED, [ITEM_A, ITEM_B], 'same-body')
    const repeated = outcome(ITEM_A, [SEED], 'same-body')
    const atom = new FakeAtom(
      new Map([
        [SEED, { ...first, result: { ...first.result, ...formats } }],
        [ITEM_A, { ...repeated, result: { ...repeated.result, ...formats } }],
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
    for (const format of Object.keys(formats)) expect(dup?.result).not.toHaveProperty(format)
    // The first page with that body keeps them all.
    expect(steps.find((s) => s.canonicalUrl === SEED)?.result).toMatchObject(formats)
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

  it('resumes from where it stopped with skipFetchedOnResume: across three runs every URL is fetched once (hosted slices, H1 E1)', async () => {
    const pages = new Map([
      [SEED, outcome(SEED, [ITEM_A, ITEM_B])],
      [ITEM_A, outcome(ITEM_A, [ITEM_B])],
      [ITEM_B, outcome(ITEM_B, [])],
    ])
    const store = new MemoryTaskStore()
    const first = new FakeAtom(pages)
    const firstReport = await interruptedAfterFirstPage(first, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl', skipFetchedOnResume: true }, store)
    expect(first.fetches).toEqual([SEED])
    const second = new FakeAtom(pages)
    const secondReport = await interruptedAfterFirstPage(second, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl', resumeFrom: firstReport.taskId, skipFetchedOnResume: true }, store)
    expect(secondReport.status).toBe('paused')
    expect(second.fetches).toEqual([ITEM_A])
    const third = new FakeAtom(pages)
    const thirdReport = await runWith(third, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl', resumeFrom: firstReport.taskId, skipFetchedOnResume: true }, store).go()
    expect(thirdReport.status).toBe('completed')
    expect(third.fetches).toEqual([ITEM_B])
    expect((await store.listSteps(firstReport.taskId)).map((step) => step.url).sort()).toEqual([SEED, ITEM_A, ITEM_B])
  })

  it('keeps a host\'s pace across runs: the task stores when each host last started and its Crawl-delay, and a resumed run waits it out (H1 E2)', async () => {
    const pages = new Map([[SEED, outcome(SEED, [ITEM_A])], [ITEM_A, outcome(ITEM_A, [])]])
    const store = new MemoryTaskStore()
    // The seed's robots.txt gives a 5 s Crawl-delay.
    const firstAtom: ScrapeAtom = { scrape: async (url) => ({ ...pages.get(url)!, crawlDelayMs: 5_000 }), close: async () => {} }
    const firstReport = await interruptedAfterFirstPage(firstAtom, { seedUrl: SEED, taskDir: '/tmp/w2l-crawl', skipFetchedOnResume: true }, store)
    expect((await store.getTask(firstReport.taskId))?.pacing).toEqual({ 'fixture.test': { lastStartedAtMs: 1_000, crawlDelayMs: 5_000 } })
    // A new run on a new orchestrator, one second later: its first request to the host waits until 5 s after the last one.
    const clock = new FakeClock(); clock.t = 2_000
    const started: number[] = []
    const atom: ScrapeAtom = { scrape: async (url) => { started.push(clock.now()); return pages.get(url)! }, close: async () => {} }
    // One worker: the fake clock adds every waiting worker's wait to the time.
    const report = await new CrawlOrchestrator({ store, atom, clock, workerCount: 1 }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl', resumeFrom: firstReport.taskId, skipFetchedOnResume: true })
    expect(report.status).toBe('completed')
    expect(started).toEqual([6_000])
    expect((await store.getTask(firstReport.taskId))?.pacing).toEqual({ 'fixture.test': { lastStartedAtMs: 6_000, crawlDelayMs: 5_000 } })
  })

  it('does not refetch a page that failed in an earlier run with skipFetchedOnResume, and keeps the page budget across runs', async () => {
    const blocked: ScrapeOutcome = { result: { ...page(ITEM_A), status: 'blocked', blockReason: 'bot_detected_generic', markdown: '' }, links: [] }
    const pages = new Map([[SEED, outcome(SEED, [ITEM_A, ITEM_B])], [ITEM_A, blocked], [ITEM_B, outcome(ITEM_B, [])]])
    const store = new MemoryTaskStore()
    const spec = { seedUrl: SEED, taskDir: '/tmp/w2l-crawl', skipFetchedOnResume: true, budget: { maxPages: 2, maxWallMs: null, maxCostUsd: null, maxTokens: null } }
    const firstReport = await interruptedAfterFirstPage(new FakeAtom(pages), spec, store)
    const second = new FakeAtom(pages)
    await interruptedAfterFirstPage(second, { ...spec, resumeFrom: firstReport.taskId }, store)
    expect(second.fetches).toEqual([ITEM_A])
    const third = new FakeAtom(pages)
    const thirdReport = await runWith(third, { ...spec, resumeFrom: firstReport.taskId }, store).go()
    // Two pages are the task's budget: the seed and the blocked page. B is not fetched, and A is not fetched again.
    expect(third.fetches).toEqual([])
    expect(thirdReport.budgetExceeded).toBe('pages')
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

  it('leaves the cost of a page whose scrape threw unknown when a paid call it carries names a rent, not the 0 a scrape that threw is taken to cost (ADR 0005 decision three)', async () => {
    // hosted_chrome's read through the rented exit, which the octocrawl-chrome service answered 503: on the run's paid calls.
    const rented = { provider: 'webshare', rung: 'hosted_chrome', capabilities: ['hosted_chrome'], ceilingUsd: 0, chargedUsd: 0, reportedCostUsd: null, sessionMs: null, outcome: null, reason: null, answer: false, fixedMonthlyUsd: 2.99 }
    const run = async (paid: boolean) => {
      const failure = new Error('the octocrawl-chrome service answered 503')
      const atom: ScrapeAtom = {
        async scrape(url) {
          // The seed costs a known 0, so the report's cost is what the page that threw makes it.
          if (url !== ITEM_A) return { result: page(url, { links: [ITEM_A], cost: 0 }), links: [ITEM_A] }
          throw paid ? carryPaidCalls(failure, { at: 1, lane: 'provider', event: 'paid_calls', detail: { calls: [rented], grant: null } }) : failure
        },
        async close() {},
      }
      const store = new MemoryTaskStore()
      const report = await new CrawlOrchestrator({ store, atom, clock: new FakeClock(), scrapeErrorCostUsd: 0 }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl' })
      return { report, failed: (await store.listSteps(report.taskId, report.attemptId)).find((s) => s.canonicalUrl === ITEM_A)?.result }
    }
    const threw = await run(true)
    expect(threw.failed).toMatchObject({ status: 'failed', failureReason: 'internal_error', usage: { externalCostUsd: null } })
    expect(threw.failed?.trace).toContainEqual(expect.objectContaining({ event: 'paid_calls', detail: { calls: [rented], grant: null } }))
    expect(threw.report).toMatchObject({ costUsd: null, costUnknown: true })
    // Without a paid call it carries, the page costs what a scrape that threw is taken to cost.
    const plain = await run(false)
    expect(plain.failed?.usage.externalCostUsd).toBe(0)
    expect(plain.report).toMatchObject({ costUsd: 0, costUnknown: false })
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

describe('CrawlOrchestrator reads a batch page again after a soft block', () => {
  const HOST = 'https://fixture.test'
  const off = (url: string): ScrapeOutcome => {
    const base = page(url)
    return { result: { ...base, evidence: { ...base.evidence, finalUrl: `${HOST}/` }, warnings: [{ code: 'redirected_off_page', message: 'sent on' }] }, links: [] }
  }
  const limited = (url: string): ScrapeOutcome => {
    const base = page(url)
    return { result: { ...base, status: 'failed', failureReason: 'http_error', markdown: null, evidence: { ...base.evidence, httpStatus: 429 } }, links: [] }
  }
  async function run(urls: readonly string[], answer: (url: string, read: number) => ScrapeOutcome, softBlocks?: number) {
    const store = new MemoryTaskStore()
    await store.putTask({ id: 'retry-1', seedUrl: urls[0]!, taskDir: '/tmp/w2l-batch', mode: 'standard', status: 'pending', budget: DEFAULT_CRAWL_BUDGET, batch: { urls, formats: ['markdown'], includeLinks: false, ...(softBlocks === undefined ? {} : { retry: { softBlocks } }) }, createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z' })
    const clock = new FakeClock()
    const reads: string[] = []
    const atom: ScrapeAtom = { scrape: async (url) => { reads.push(url); return answer(url, reads.filter((seen) => seen === url).length) }, close: async () => {} }
    const report = await new CrawlOrchestrator({ store, atom, clock, workerCount: 1, perHostMinDelayMs: 0 }).run({ seedUrl: urls[0]!, taskDir: '/tmp/w2l-batch', resumeFrom: 'retry-1', skipFetchedOnResume: true, maxDepth: 0 })
    return { store, clock, reads, report, steps: await store.listSteps('retry-1') }
  }
  const retries = (step: { result: FetchResult | null }) => step.result!.trace.filter((event) => event.event === 'soft_block_retry').map((event) => event.detail)

  it('keeps one step per URL, the last read, with the read set aside on its trace, and leaves the wait to the other pages', async () => {
    const urls = [`${HOST}/a`, `${HOST}/b`, `${HOST}/c`]
    const { reads, steps, report } = await run(urls, (url, read) => url === urls[0] && read === 1 ? off(url) : outcome(url, []))
    expect(report.status).toBe('completed')
    // The two seconds the page waits go to the pages behind it.
    expect(reads).toEqual([urls[0], urls[1], urls[2], urls[0]])
    expect(steps.map((step) => step.url).sort()).toEqual(urls)
    const first = steps.find((step) => step.url === urls[0])!
    expect(first.result?.warnings ?? []).toEqual([])
    expect(retries(first)).toEqual([{ read: 1, signal: 'redirected_off_page', status: 'success', httpStatus: 200, finalUrl: `${HOST}/` }])
  })

  it('keeps on the page that was stored what a read set aside did to the pace', async () => {
    const urls = [`${HOST}/a`, `${HOST}/b`]
    // Two signals in a row: the read of /a set aside, then /b.
    const { steps } = await run(urls, (url, read) => read === 1 ? off(url) : outcome(url, []))
    const events = steps.flatMap((step) => step.result!.trace.filter((event) => event.event === 'pacing_adjusted').map((event) => event.detail?.change))
    expect(events).toContain('slowed')
  })

  it('stops at softBlocks, keeping the last answer; 0 reads once; a 429 goes back like a page sent away', async () => {
    const urls = [`${HOST}/a`]
    const twice = await run(urls, (url) => limited(url), 2)
    expect(twice.reads).toHaveLength(3)
    expect(twice.steps).toHaveLength(1)
    expect(twice.steps[0]).toMatchObject({ status: 'failed' })
    expect(retries(twice.steps[0]!)).toHaveLength(2)
    expect((await run(urls, (url) => limited(url), 0)).reads).toHaveLength(1)
    expect((await run(urls, (url) => limited(url))).reads).toHaveLength(2)
  })

  it('counts what a read set aside cost, though only the last read is stored', async () => {
    const url = `${HOST}/a`
    const { report } = await run([url], (_url, read) => ({ result: page(url, { cost: 0.5, hash: `h${read}` }), links: [] }))
    expect(report.costUsd).toBe(0.5)
    const { report: twice } = await run([url], (_url, read) => { const paid = page(url, { cost: 0.5 }); return read === 1 ? { ...off(url), result: { ...off(url).result, usage: paid.usage } } : { result: paid, links: [] } })
    expect(twice.costUsd).toBe(1)
  })

  it('lets a host go when a page answers the same however slowly it is read: the wait is bounded, and the rest of the batch runs at its own pace', async () => {
    const urls = Array.from({ length: 40 }, (_, i) => `${HOST}/exhibitor/${i}`)
    const { reads, steps, clock, store } = await run(urls, (url) => off(url))
    expect(steps).toHaveLength(40)
    const pacing = (await store.getTask('retry-1'))!.pacing!['fixture.test']!
    expect(pacing.settled).toEqual(['redirected_off_page'])
    expect(pacing.adaptive ?? null).toBeNull()
    // About two minutes of slow reads once, not 120 s a page; and no page is read again after that.
    expect(clock.t - 1_000).toBeLessThan(240_000)
    expect(reads.length).toBeLessThan(60)
    const last = reads.slice(-10)
    expect(new Set(last).size).toBe(10)
  })

  it('never lets a host go on a 429, however slowly it is read', async () => {
    const urls = Array.from({ length: 16 }, (_, i) => `${HOST}/p/${i}`)
    const { store } = await run(urls, (url) => limited(url), 0)
    const pacing = (await store.getTask('retry-1'))!.pacing!['fixture.test']!
    expect(pacing.settled).toBeUndefined()
    expect(pacing.adaptive?.delayMs).toBe(120_000)
  })

  it('keeps a host slowed when its pages come back: a limit on rate, not on the pages', async () => {
    // The site answers another page for its first 8 reads, then serves every page.
    let answered = 0
    const urls = Array.from({ length: 20 }, (_, i) => `${HOST}/p/${i}`)
    const { steps, store } = await run(urls, (url) => ++answered <= 8 ? off(url) : outcome(url, []))
    // The first pages were read twice inside the limit and are stored as they came; the rest of the batch is the pages asked for.
    expect(steps.filter((step) => (step.result?.warnings ?? []).length > 0)).toHaveLength(4)
    const pacing = (await store.getTask('retry-1'))!.pacing!['fixture.test']!
    expect(pacing.settled).toBeUndefined()
    expect(pacing.adaptive?.slowdowns).toBeGreaterThan(0)
  })

  async function limitedSite(pages: number, reads: number, windowMs: number, answers: (url: string, read: number) => boolean = () => true) {
    const clock = new FakeClock()
    const starts: number[] = []
    let blockedUntil = 0
    let blocks = 0
    const urls = Array.from({ length: pages }, (_, i) => `${HOST}/exhibitor/${i}`)
    const store = new MemoryTaskStore()
    await store.putTask({ id: 'retry-limit', seedUrl: urls[0]!, taskDir: '/tmp/w2l-batch', mode: 'standard', status: 'pending', budget: DEFAULT_CRAWL_BUDGET, batch: { urls, formats: ['markdown'], includeLinks: false }, createdAt: 'x', updatedAt: 'x' })
    const atom: ScrapeAtom = {
      scrape: async (url) => {
        starts.push(clock.t)
        if (clock.t >= blockedUntil && starts.filter((at) => at >= blockedUntil && at > clock.t - windowMs).length > reads) { blockedUntil = clock.t + 45_000; blocks++ }
        const answer = clock.t < blockedUntil || !answers(url, starts.length) ? off(url) : outcome(url, [])
        clock.t += 3_000
        return answer
      },
      close: async () => {},
    }
    await new CrawlOrchestrator({ store, atom, clock, workerCount: 1, perHostMinDelayMs: 250 }).run({ seedUrl: urls[0]!, taskDir: '/tmp/w2l-batch', resumeFrom: 'retry-limit', skipFetchedOnResume: true, maxDepth: 0 })
    const steps = await store.listSteps('retry-limit')
    return { clock, blocks, steps, sentAway: steps.filter((step) => (step.result?.warnings ?? []).length > 0).map((step) => step.url), pace: (await store.getTask('retry-limit'))!.pacing!['fixture.test']! }
  }

  it('reads a site with a limit on rate to the end: it stops easing back into the limit, and reads again after the block has passed', async () => {
    // As www.english.ids-cologne.de answered on 2026-11-07: a 17th read within two minutes, and every read for 45 s goes to the home page; then it counts afresh.
    const { clock, blocks, steps, sentAway } = await limitedSite(272, 16, 120_000)
    expect(steps).toHaveLength(272)
    expect(sentAway).toEqual([])
    expect(blocks).toBeLessThanOrEqual(5)
    expect(clock.t).toBeLessThan(45 * 60_000)
  })

  it('learns a limit that takes more pages to reach than easing back to the baseline does', async () => {
    const { sentAway, pace } = await limitedSite(600, 60, 600_000)
    expect(sentAway).toEqual([])
    expect(pace.adaptive?.floorMs).toBe(8_000)
  })

  it('takes pages gone for what they are: pages sent away for good, two in a row, set no floor and leave the batch at its pace', async () => {
    const { clock, sentAway, pace } = await limitedSite(100, 100_000, 600_000, (url) => !/\/(40|41|80|81)$/.test(url))
    expect(sentAway).toHaveLength(4)
    expect(pace.adaptive?.floorMs).toBeUndefined()
    expect(clock.t).toBeLessThan(10 * 60_000)
  })

  it('carries a signal the host settled into the next run', async () => {
    const store = new MemoryTaskStore()
    const urls = [`${HOST}/a`, `${HOST}/b`, `${HOST}/c`]
    await store.putTask({ id: 'retry-2', seedUrl: urls[0]!, taskDir: '/tmp/w2l-batch', mode: 'standard', status: 'pending', budget: DEFAULT_CRAWL_BUDGET, batch: { urls, formats: ['markdown'], includeLinks: false }, pacing: { 'fixture.test': { lastStartedAtMs: null, crawlDelayMs: null, settled: ['redirected_off_page'] } }, createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z' })
    const reads: string[] = []
    const atom: ScrapeAtom = { scrape: async (url) => { reads.push(url); return off(url) }, close: async () => {} }
    await new CrawlOrchestrator({ store, atom, clock: new FakeClock(), workerCount: 1, perHostMinDelayMs: 0 }).run({ seedUrl: urls[0]!, taskDir: '/tmp/w2l-batch', resumeFrom: 'retry-2', skipFetchedOnResume: true, maxDepth: 0 })
    expect(reads).toEqual(urls)
  })

  it('waits out a Retry-After before the read again, and does not sit out one past the longest wait', async () => {
    const url = `${HOST}/a`
    const until = (ms: number, clock: { at?: number }) => ({ ...limited(url), result: { ...limited(url).result, retryAt: (clock.at ?? 1_000) + ms } })
    const near = await run([url], (_url, read) => read === 1 ? until(60_000, {}) : outcome(url, []))
    expect(near.reads).toHaveLength(2)
    expect(near.clock.t).toBeGreaterThanOrEqual(61_000)
    expect(near.steps[0]).toMatchObject({ status: 'success' })
    const far = await run([url], () => until(3_600_000, {}))
    expect(far.reads).toHaveLength(1)
    expect(far.steps[0]).toMatchObject({ status: 'failed' })
  })

  it('stores the read in hand when the run stops with a page waiting: a read was made, so the page has an answer', async () => {
    const url = `${HOST}/a`
    const store = new MemoryTaskStore()
    await store.putTask({ id: 'retry-3', seedUrl: url, taskDir: '/tmp/w2l-batch', mode: 'standard', status: 'pending', budget: { ...DEFAULT_CRAWL_BUDGET, maxWallMs: 500 }, batch: { urls: [url], formats: ['markdown'], includeLinks: false }, createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z' })
    const atom: ScrapeAtom = { scrape: async () => off(url), close: async () => {} }
    const report = await new CrawlOrchestrator({ store, atom, clock: new FakeClock(), workerCount: 1, perHostMinDelayMs: 0 }).run({ seedUrl: url, taskDir: '/tmp/w2l-batch', resumeFrom: 'retry-3', skipFetchedOnResume: true, maxDepth: 0, budget: { ...DEFAULT_CRAWL_BUDGET, maxWallMs: 500 } })
    expect(report.budgetExceeded).toBe('time')
    const steps = await store.listSteps('retry-3')
    expect(steps).toHaveLength(1)
    expect(steps[0]?.result?.warnings?.map((warning) => warning.code)).toEqual(['redirected_off_page'])
  })

  it('does not run a page\'s steps twice', async () => {
    const url = `${HOST}/a`
    const store = new MemoryTaskStore()
    await store.putTask({ id: 'retry-4', seedUrl: url, taskDir: '/tmp/w2l-batch', mode: 'standard', status: 'pending', budget: DEFAULT_CRAWL_BUDGET, batch: { urls: [url], formats: ['markdown'], includeLinks: false, actions: [{ type: 'click', selector: '#send' }] }, createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z' })
    const reads: string[] = []
    const atom: ScrapeAtom = { scrape: async (read) => { reads.push(read); return off(read) }, close: async () => {} }
    await new CrawlOrchestrator({ store, atom, clock: new FakeClock(), workerCount: 1, perHostMinDelayMs: 0 }).run({ seedUrl: url, taskDir: '/tmp/w2l-batch', resumeFrom: 'retry-4', skipFetchedOnResume: true, maxDepth: 0 })
    expect(reads).toHaveLength(1)
  })

  it('reads a crawl\'s pages once', async () => {
    const reads: string[] = []
    const atom: ScrapeAtom = { scrape: async (url) => { reads.push(url); return off(url) }, close: async () => {} }
    await new CrawlOrchestrator({ store: new MemoryTaskStore(), atom, clock: new FakeClock(), workerCount: 1, perHostMinDelayMs: 0 }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl' })
    expect(reads).toEqual([SEED])
  })
})

describe('CrawlOrchestrator batch append', () => {
  const BATCH_A = 'https://fixture.test/batch/a'
  const BATCH_B = 'https://fixture.test/batch/b'
  const BATCH_C = 'https://other.test/batch/c'
  const STARTED = '2026-10-02T00:00:00.000Z'

  /** An atom that holds the pages in `held` until released, so an append can land while they are in flight. */
  class GatedAtom implements ScrapeAtom {
    readonly fetches: string[] = []
    private readonly gates = new Map<string, () => void>()
    constructor(private readonly held: ReadonlySet<string>) {}
    async scrape(url: string): Promise<ScrapeOutcome> {
      this.fetches.push(url)
      if (this.held.has(url)) await new Promise<void>((resolve) => { this.gates.set(url, resolve) })
      return outcome(url, [])
    }
    release(url: string): void { this.gates.get(url)?.() }
    async close(): Promise<void> {}
  }

  async function batchTask(store: TaskStore, urls: readonly string[]): Promise<void> {
    await store.putTask({ id: 'batch-1', seedUrl: urls[0]!, taskDir: '/tmp/w2l-batch', mode: 'standard', status: 'pending', budget: DEFAULT_CRAWL_BUDGET, batch: { urls, formats: ['markdown'], includeLinks: false }, createdAt: STARTED, updatedAt: STARTED })
  }

  /** A batch run as the engine starts one: the stored task, depth 0, no host list, the whole host and exact URLs. */
  const batchSpec = { seedUrl: BATCH_A, taskDir: '/tmp/w2l-batch', maxDepth: 0, allowlistedDomains: [], crawlEntireDomain: true, deduplicateSimilarURLs: false, sitemap: 'skip' as const }

  it('keeps the pages a list step read when shutdown cuts its URL, hands them to the atom when the batch resumes, and clears them once the URL is stored', async () => {
    const store = new MemoryTaskStore()
    await store.putTask({ id: 'batch-1', seedUrl: BATCH_A, taskDir: '/tmp/w2l-batch', mode: 'standard', status: 'pending', budget: DEFAULT_CRAWL_BUDGET, batch: { urls: [BATCH_A, BATCH_B], formats: ['markdown'], includeLinks: false, actions: [{ type: 'paginate', nextSelector: 'a.next' }] }, createdAt: STARTED, updatedAt: STARTED })
    const read = (page: number): ListPageRead => ({ step: 0, page, url: `${BATCH_A}?p=${page}`, html: `<p>${page}</p>`, state: `s${page}`, items: null, itemRefs: null, count: null })
    const shutdown = new AbortController()
    class ListAtom implements ScrapeAtom {
      readonly calls: { url: string; resume: ListPageRead[] | undefined }[] = []
      async scrape(url: string, context?: ExecutionContext): Promise<ScrapeOutcome> {
        this.calls.push({ url, resume: context?.listResume?.pages.map((page) => ({ ...page })) })
        if (url === BATCH_A && this.calls.filter((call) => call.url === BATCH_A).length === 1) {
          // Two pages read and told, then the service goes down before the URL has a result.
          context?.onListPage?.(read(1))
          context?.onListPage?.(read(2))
          shutdown.abort(new DOMException('service shutdown', 'ShutdownError'))
          throw new DOMException('service shutdown', 'ShutdownError')
        }
        return outcome(url, [])
      }
      async close(): Promise<void> {}
    }
    const atom = new ListAtom()
    const first = await new CrawlOrchestrator({ store, atom, clock: new FakeClock(), workerCount: 1, perHostMinDelayMs: 0, shutdownSignal: shutdown.signal }).run({ ...batchSpec, taskId: 'batch-1' })
    expect(first.status).toBe('paused')
    expect(await store.listPagesRead('batch-1', BATCH_A)).toEqual([read(1), read(2)])

    const second = await new CrawlOrchestrator({ store, atom, clock: new FakeClock(), workerCount: 1, perHostMinDelayMs: 0 }).run({ ...batchSpec, resumeFrom: 'batch-1' })
    expect(second.status).toBe('completed')
    expect(atom.calls.filter((call) => call.url === BATCH_A).map((call) => call.resume)).toEqual([undefined, [read(1), read(2)]])
    // Stored with its URL's step: nothing is left to resume from.
    expect(await store.listPagesRead('batch-1', BATCH_A)).toEqual([])
    expect((await store.listSteps('batch-1')).map((step) => step.url).sort()).toEqual([BATCH_A, BATCH_B].sort())
  })

  it('runs a batch over some of its hosts with batchHosts, leaving the rest for a later run and pausing rather than completing (H1 E3)', async () => {
    const store = new MemoryTaskStore()
    await batchTask(store, [BATCH_A, BATCH_C, BATCH_B])
    const pages = new Map([[BATCH_A, outcome(BATCH_A, [])], [BATCH_B, outcome(BATCH_B, [])], [BATCH_C, outcome(BATCH_C, [])]])
    const first = new FakeAtom(pages)
    const firstReport = await new CrawlOrchestrator({ store, atom: first, clock: new FakeClock(), workerCount: 1, perHostMinDelayMs: 0 }).run({ ...batchSpec, taskId: 'batch-1', batchHosts: ['fixture.test'] })
    expect(first.fetches).toEqual([BATCH_A, BATCH_B])
    expect(firstReport.status).toBe('paused')
    expect((await store.getTask('batch-1'))?.status).toBe('paused')
    const second = new FakeAtom(pages)
    const secondReport = await new CrawlOrchestrator({ store, atom: second, clock: new FakeClock(), workerCount: 1, perHostMinDelayMs: 0 }).run({ ...batchSpec, resumeFrom: 'batch-1', batchHosts: ['other.test'] })
    expect(second.fetches).toEqual([BATCH_C])
    expect(secondReport.status).toBe('completed')
  })

  it('keeps the pages a list step read when its URL stopped at a check the site put up, so a later run can go on from them', async () => {
    const store = new MemoryTaskStore()
    await store.putTask({ id: 'batch-1', seedUrl: BATCH_A, taskDir: '/tmp/w2l-batch', mode: 'standard', status: 'pending', budget: DEFAULT_CRAWL_BUDGET, batch: { urls: [BATCH_A, BATCH_B], formats: ['markdown'], includeLinks: false, actions: [{ type: 'paginate', nextSelector: 'a.next' }] }, createdAt: STARTED, updatedAt: STARTED })
    const read = (page: number): ListPageRead => ({ step: 0, page, url: `${BATCH_A}?p=${page}`, html: `<p>${page}</p>`, state: `s${page}`, items: null, itemRefs: null, count: null })
    const stoppedAt = (url: string, lists: FetchResult['actions'] extends infer A ? A extends { lists: infer L } ? L : never : never, status: FetchResult['status'] = 'blocked'): ScrapeOutcome => {
      const result: FetchResult = { ...page(url), status, failureReason: null, blockReason: status === 'blocked' ? 'cloudflare_challenge' : null, actions: { screenshots: [], scrapes: [], javascriptReturns: [], pdfs: [], lists } }
      return { result, links: [] }
    }
    class CheckedAtom implements ScrapeAtom {
      async scrape(url: string, context?: ExecutionContext): Promise<ScrapeOutcome> {
        if (url === BATCH_A) {
          context?.onListPage?.(read(1))
          context?.onListPage?.(read(2))
          return stoppedAt(url, [{ index: 0, type: 'paginate', stoppedBy: 'challenge', rounds: 2, items: null, challenge: { page: 3, url: `${BATCH_A}?p=3`, reason: 'cloudflare_challenge', signals: ['cf_interstitial_text'] } }])
        }
        context?.onListPage?.(read(1))
        // Blocked on its first page, with no list step stopped at a check: nothing to go on from.
        return stoppedAt(url, [])
      }
      async close(): Promise<void> {}
    }
    const report = await new CrawlOrchestrator({ store, atom: new CheckedAtom(), clock: new FakeClock(), workerCount: 1, perHostMinDelayMs: 0 }).run({ ...batchSpec, taskId: 'batch-1' })
    expect(report.status).toBe('completed')
    expect((await store.listSteps('batch-1')).map((step) => [step.url, step.status]).sort()).toEqual([[BATCH_A, 'blocked'], [BATCH_B, 'blocked']])
    expect(await store.listPagesRead('batch-1', BATCH_A)).toEqual([read(1), read(2)])
    expect(await store.listPagesRead('batch-1', BATCH_B)).toEqual([])
  })

  it('seeds URLs appended while it runs, fetches them in the same attempt, also on a new host, and keeps the longer list at the end', async () => {
    const store = new MemoryTaskStore()
    await batchTask(store, [BATCH_A, BATCH_B])
    const atom = new GatedAtom(new Set([BATCH_A]))
    const orchestrator = new CrawlOrchestrator({ store, atom, clock: new FakeClock(), workerCount: 2, perHostMinDelayMs: 0 })
    const run = orchestrator.run({ ...batchSpec, taskId: 'batch-1' })
    await expect.poll(() => atom.fetches).toContain(BATCH_A)
    // The engine's append: the row grows by one URL while the first page is still out.
    const current = (await store.getTask('batch-1'))!
    await store.putTask({ ...current, batch: { ...current.batch!, urls: [BATCH_A, BATCH_B, BATCH_C] }, updatedAt: '2026-10-02T00:00:01.000Z' })
    // The run re-reads the row and seeds the tail: the new host's page is fetched while a is still out (b waits for a: one page at a time on a host until its robots.txt is known).
    await expect.poll(() => atom.fetches).toContain(BATCH_C)
    expect(atom.fetches).toEqual([BATCH_A, BATCH_C])
    expect(orchestrator.pagesAhead()).toBe(2)
    atom.release(BATCH_A)
    const report = await run
    expect(report).toMatchObject({ status: 'completed', pagesFetched: 3 })
    expect([...atom.fetches].sort()).toEqual([BATCH_A, BATCH_B, BATCH_C])
    const steps = await store.listSteps('batch-1')
    expect(steps.map((step) => step.url).sort()).toEqual([BATCH_A, BATCH_B, BATCH_C])
    expect(steps.every((step) => step.attemptId === report.attemptId && step.depth === 0)).toBe(true)
    // The final write is built from the row as it then is, not from the two-URL object the run opened with.
    const finished = (await store.getTask('batch-1'))!
    expect(finished.status).toBe('completed')
    expect(finished.batch?.urls).toEqual([BATCH_A, BATCH_B, BATCH_C])
    expect(await store.countCompletedSteps('batch-1')).toBe(3)
  })

  it('leaves a URL appended after the run has ended without a step, which a resume of the task then fetches alone', async () => {
    const store = new MemoryTaskStore()
    await batchTask(store, [BATCH_A])
    const atom = new GatedAtom(new Set())
    const report = await new CrawlOrchestrator({ store, atom, clock: new FakeClock(), perHostMinDelayMs: 0 }).run({ ...batchSpec, taskId: 'batch-1' })
    expect(report).toMatchObject({ status: 'completed', pagesFetched: 1 })
    // The engine's append to a completed batch: the list grows and the status returns to pending; no run is there to seed it.
    const current = (await store.getTask('batch-1'))!
    await store.putTask({ ...current, status: 'pending', batch: { ...current.batch!, urls: [BATCH_A, BATCH_C] }, updatedAt: '2026-10-02T00:00:01.000Z' })
    expect(atom.fetches).toEqual([BATCH_A])
    expect((await store.listSteps('batch-1')).map((step) => step.url)).toEqual([BATCH_A])
    expect(await store.countCompletedSteps('batch-1')).toBe(1)
    // The relaunch the engine then makes: a resume seeds only the URL without a step, in a second attempt.
    const resumed = await new CrawlOrchestrator({ store, atom, clock: new FakeClock(), perHostMinDelayMs: 0 }).run({ ...batchSpec, resumeFrom: 'batch-1' })
    expect(resumed).toMatchObject({ taskId: 'batch-1', status: 'completed', pagesFetched: 1 })
    expect(resumed.attemptId).not.toBe(report.attemptId)
    expect(atom.fetches).toEqual([BATCH_A, BATCH_C])
    expect(new Map((await store.listSteps('batch-1')).map((step) => [step.url, step.attemptId]))).toEqual(new Map([[BATCH_A, report.attemptId], [BATCH_C, resumed.attemptId]]))
    expect(await store.countCompletedSteps('batch-1')).toBe(2)
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

  it('keeps the spend cap per task: a paid call of a page the shutdown cut still counts on resume (ROADMAP PA item 4)', async () => {
    const pages = new Map([[SEED, outcome(SEED, [ITEM_A, ITEM_B])], [ITEM_A, outcome(ITEM_A, [])], [ITEM_B, outcome(ITEM_B, [])]])
    const shutdown = new AbortController()
    // Every page makes one paid call charged at its $1 ceiling; the first run is shut down right after page A's call.
    const paying = (cutAfter: string | null) => {
      const paid: string[] = []
      const atom: ScrapeAtom = {
        async scrape(url: string, context?: ExecutionContext): Promise<ScrapeOutcome> {
          const reservation = context?.spend?.reserve(1)
          if (reservation === null || reservation === undefined) throw new Error(`no room for the paid call of ${url}`)
          reservation.settle(null)
          paid.push(url)
          if (url === cutAfter) {
            shutdown.abort(new DOMException('service shutdown', 'ShutdownError'))
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          // As the ladder answers a paid call: the ledger's charge on the page's usage.
          const page = pages.get(url)!
          return { ...page, result: { ...page.result, usage: { ...page.result.usage, externalCostChargedUsd: 1 } } }
        },
        async close(): Promise<void> {},
      }
      return { atom, paid }
    }
    const store = new MemoryTaskStore()
    const budget = { ...DEFAULT_CRAWL_BUDGET, maxCostUsd: 3 }
    const first = paying(ITEM_A)
    const firstReport = await new CrawlOrchestrator({ store, atom: first.atom, clock: new FakeClock(), workerCount: 1, shutdownSignal: shutdown.signal }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl', budget })
    expect(firstReport.status).toBe('paused')
    expect(first.paid).toEqual([SEED, ITEM_A])
    // Page A was never written, but its call was paid: the attempt keeps both charges.
    expect((await store.listAttempts(firstReport.taskId)).map((attempt) => attempt.chargedUsd)).toEqual([2])
    // The resume, under the task's budget as the engine passes it, opens its ledger at $2 of the $3: the refetched seed
    // fills it, and page A is not paid for again.
    const resumed = paying(null)
    const resumeReport = await new CrawlOrchestrator({ store, atom: resumed.atom, clock: new FakeClock(), workerCount: 1 }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-crawl', budget, resumeFrom: firstReport.taskId })
    expect(resumed.paid).toEqual([SEED])
    expect(resumeReport.budgetExceeded).toBe('cost')
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

describe('adaptive pacing: a batch slows a host that pushes back', () => {
  const HOST_URLS = ['https://paced.test/1', 'https://paced.test/2', 'https://paced.test/3', 'https://paced.test/4']
  const spec = { seedUrl: HOST_URLS[0]!, taskDir: '/tmp/w2l-paced', maxDepth: 0, allowlistedDomains: [], crawlEntireDomain: true, deduplicateSimilarURLs: false, sitemap: 'skip' as const }
  const limited = (url: string): ScrapeOutcome => ({ result: { ...page(url), status: 'blocked', blockReason: 'rate_limit', markdown: '', evidence: { ...page(url).evidence, httpStatus: 429 } }, links: [] })

  it('two 429s in a row hold the host to one page at a time two seconds apart, write a pacing_adjusted trace line on the page that tipped it, and keep the pace with the task', async () => {
    const store = new MemoryTaskStore()
    await store.putTask({ id: 'paced-1', seedUrl: HOST_URLS[0]!, taskDir: '/tmp/w2l-paced', mode: 'standard', status: 'pending', budget: DEFAULT_CRAWL_BUDGET, batch: { urls: HOST_URLS, formats: ['markdown'], includeLinks: false, retry: { softBlocks: 0 } }, createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z' })
    const clock = new FakeClock()
    const started: number[] = []
    const atom: ScrapeAtom = {
      scrape: async (url) => { started.push(clock.now()); return url.endsWith('/1') || url.endsWith('/2') ? limited(url) : outcome(url, []) },
      close: async () => {},
    }
    // Two workers allowed, but the policy's per-host ceiling is two as well: the fake clock makes every wait exact.
    const report = await new CrawlOrchestrator({ store, atom, clock, workerCount: 1, perHostConcurrency: 2, perHostMinDelayMs: 250 }).run({ ...spec, taskId: 'paced-1' })
    expect(report.status).toBe('completed')
    expect(report.pagesFetched).toBe(4)
    // The second 429 arrives at 1,250: the host waits 2 s from then, and 2 s between the pages after it.
    expect(started).toEqual([1_000, 1_250, 3_250, 5_250])
    const steps = [...(await store.listSteps('paced-1'))].sort((a, b) => a.url.localeCompare(b.url))
    const adjusted = steps.map((step) => step.result?.trace.filter((event) => event.event === 'pacing_adjusted').map((event) => event.detail) ?? [])
    expect(adjusted).toEqual([[], [{ host: 'paced.test', change: 'slowed', signal: 'rate_limited', ceiling: 1, delayMs: 2_000, untilMs: 3_250 }], [], []])
    expect((await store.getTask('paced-1'))?.pacing).toEqual({ 'paced.test': { lastStartedAtMs: 5_250, crawlDelayMs: null, cooldownUntilMs: 3_250, adaptive: { ceiling: 1, delayMs: 2_000, signals: 0, okStreak: 2, slowdowns: 1, cause: 'rate_limited', normalSince: true } } })
  })

  it('a resumed run on another orchestrator starts under the stored pace', async () => {
    const store = new MemoryTaskStore()
    await store.putTask({ id: 'paced-2', seedUrl: HOST_URLS[0]!, taskDir: '/tmp/w2l-paced', mode: 'standard', status: 'pending', budget: DEFAULT_CRAWL_BUDGET, batch: { urls: HOST_URLS.slice(0, 2), formats: ['markdown'], includeLinks: false }, pacing: { 'paced.test': { lastStartedAtMs: 900, crawlDelayMs: null, cooldownUntilMs: 4_000, adaptive: { ceiling: 1, delayMs: 3_000, signals: 0, okStreak: 0, slowdowns: 1 } } }, createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z' })
    const clock = new FakeClock()
    const started: number[] = []
    const atom: ScrapeAtom = { scrape: async (url) => { started.push(clock.now()); return outcome(url, []) }, close: async () => {} }
    // One worker: the fake clock adds every waiting worker's wait to the time.
    const report = await new CrawlOrchestrator({ store, atom, clock, workerCount: 1, perHostConcurrency: 2, perHostMinDelayMs: 250 }).run({ ...spec, taskId: 'paced-2' })
    expect(report.status).toBe('completed')
    expect(started).toEqual([4_000, 7_000])
    expect((await store.getTask('paced-2'))?.pacing?.['paced.test']).toMatchObject({ lastStartedAtMs: 7_000, adaptive: { ceiling: 1, delayMs: 3_000, okStreak: 2 } })
  })
})
