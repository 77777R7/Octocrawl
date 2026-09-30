import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Task } from '@w2l/contracts'
import { startFixtureServer, type FixtureServer } from '@w2l/fixtures'
import { CHECKPOINT_FILENAME, CrawlOrchestrator, SqliteTaskStore } from '@w2l/runtime'
import { CRAWL_USAGE, latestTaskId, parseCrawlArgs, resumeOptions, runCrawl } from '../src/crawlCli.js'
import { LadderScrapeAtom } from '../src/scrapeAtom.js'
import { buildChannels } from '../src/ladderCli.js'
import { LadderRunner } from '../src/routing/ladder.js'
import { MemoryRoutingHistory } from '../src/routing/vendorRouter.js'

describe('crawl CLI arguments', () => {
  it('requires a URL unless --resume', () => {
    expect(() => parseCrawlArgs([])).toThrow(/usage: w2l crawl/)
    expect(() => parseCrawlArgs(['crawl'])).toThrow(/usage: w2l crawl/)
  })

  it('accepts the crawl prefix and scrape-like flags', () => {
    expect(parseCrawlArgs(['crawl', 'https://example.com/'])).toMatchObject({
      url: 'https://example.com/',
      mode: 'standard',
      headed: false,
      resume: false,
      useCached: false,
      maxPages: null,
    })
    expect(parseCrawlArgs(['--research', '--headed', '--max-pages', '20', 'https://example.com/p'])).toMatchObject({
      mode: 'research',
      headed: true,
      maxPages: 20,
      url: 'https://example.com/p',
    })
  })

  it('parses --resume with an optional task dir', () => {
    expect(parseCrawlArgs(['--resume', '/tmp/task'])).toMatchObject({
      resume: true,
      taskDir: '/tmp/task',
      url: null,
    })
    expect(parseCrawlArgs(['--resume', 'https://example.com/'])).toMatchObject({
      resume: true,
      url: 'https://example.com/',
    })
  })

  it('rejects unknown flags and headed-by-default', () => {
    expect(() => parseCrawlArgs(['--stealth', 'https://example.com/'])).toThrow(/unknown flag --stealth/)
    expect(parseCrawlArgs(['https://example.com/']).headed).toBe(false)
    expect(CRAWL_USAGE).toContain('w2l crawl')
    expect(CRAWL_USAGE).toContain('--headed')
  })
})

describe('crawl CLI --resume options', () => {
  const at = '2026-09-29T00:00:00.000Z'
  const stored: Task = {
    id: 'task-1', seedUrl: 'https://example.com/', taskDir: '/tmp/task', mode: 'research', status: 'paused',
    budget: { maxPages: 20, maxWallMs: null, maxCostUsd: null, maxTokens: null },
    crawl: { maxDepth: 2, allowlistedDomains: ['example.com', 'www.example.com'] },
    createdAt: at, updatedAt: at,
  }

  it('runs a task with the options it was started with; repeating them is not a conflict', () => {
    const expected = { seedUrl: 'https://example.com/', mode: 'research', budget: stored.budget, maxDepth: 2, allowlistedDomains: ['example.com', 'www.example.com'] }
    expect(resumeOptions(stored, parseCrawlArgs(['--resume', '/tmp/task']))).toEqual(expected)
    expect(resumeOptions(stored, parseCrawlArgs(['--resume', '/tmp/task', '--research', '--max-pages', '20', '--max-depth', '2', '--allowlist-hosts', 'www.example.com,example.com']))).toEqual(expected)
  })

  it('rejects a flag that names a different value instead of dropping it', () => {
    expect(() => resumeOptions(stored, parseCrawlArgs(['--resume', '/tmp/task', '--max-pages', '100']))).toThrow(/--max-pages 100 .*20/)
    expect(() => resumeOptions(stored, parseCrawlArgs(['--resume', '/tmp/task', '--max-depth', '5']))).toThrow(/--max-depth 5/)
    expect(() => resumeOptions(stored, parseCrawlArgs(['--resume', '/tmp/task', '--authed']))).toThrow(/--authed/)
    expect(() => resumeOptions(stored, parseCrawlArgs(['--resume', '/tmp/task', '--allowlist-hosts', 'other.test']))).toThrow(/--allowlist-hosts other\.test/)
  })

  it('takes depth and hosts from the flags only for a task stored before they were kept', () => {
    const legacy: Task = { ...stored, crawl: undefined }
    expect(resumeOptions(legacy, parseCrawlArgs(['--resume', '/tmp/task', '--max-depth', '1', '--allowlist-hosts', 'example.com']))).toMatchObject({ maxDepth: 1, allowlistedDomains: ['example.com'] })
  })
})

describe('w2l crawl against the fixture graph', () => {
  let server: FixtureServer

  beforeAll(async () => {
    server = await startFixtureServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('crawls listing → items, then resumes from the same sqlite after a simulated kill', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-crawl-'))
    const seed = `${server.url}/crawl/listing`
    const host = new URL(server.url).hostname
    const policy = { mode: 'standard' as const, allowlistedDomains: [host] }
    const store = SqliteTaskStore.open(dir)
    const channels = buildChannels('standard', {
      localSubjects: { browser_local: { fetch: async () => { throw new Error('CI crawl must stay on HTTP; browser arm was reached') } } },
    })
    expect(channels.map((c) => c.id)).toEqual(['http', 'browser_local'])
    const runner = new LadderRunner(channels, policy, new MemoryRoutingHistory())
    const atom = new LadderScrapeAtom(runner)
    // The kill lands right after the first page is checkpointed.
    const kill = new AbortController()
    const putStep = store.putStep.bind(store)
    store.putStep = async (step) => { await putStep(step); kill.abort(new DOMException('simulated kill', 'ShutdownError')) }
    const first = new CrawlOrchestrator({ store, atom, shutdownSignal: kill.signal })
    try {
      const report = await first.run({
        seedUrl: seed,
        taskDir: dir,
        allowlistedDomains: [host],
        budget: { maxPages: 20, maxWallMs: null, maxCostUsd: null, maxTokens: null },
      })
      expect(report.pagesFetched).toBe(1)
      expect(report.status).toBe('paused')
      const firstSteps = await store.listSteps(report.taskId)
      expect(firstSteps.map((s) => s.canonicalUrl)).toEqual([seed])
      expect(firstSteps[0]?.result?.links).toEqual(
        expect.arrayContaining([
          `${server.url}/crawl/item/1`,
          `${server.url}/crawl/item/2`,
          `${server.url}/crawl/item/3`,
          seed,
        ]),
      )
    } finally {
      await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
      await store.close()
    }

    const reopened = SqliteTaskStore.open(dir)
    const resumeId = await latestTaskId(reopened)
    const resumeChannels = buildChannels('standard', {
      localSubjects: { browser_local: { fetch: async () => { throw new Error('CI crawl must stay on HTTP; browser arm was reached') } } },
    })
    const resumeRunner = new LadderRunner(resumeChannels, policy, new MemoryRoutingHistory())
    const resumeAtom = new LadderScrapeAtom(resumeRunner)
    const second = new CrawlOrchestrator({ store: reopened, atom: resumeAtom })
    try {
      const resumed = await second.run({
        seedUrl: seed,
        taskDir: dir,
        resumeFrom: resumeId,
        allowlistedDomains: [host],
        budget: { maxPages: 20, maxWallMs: null, maxCostUsd: null, maxTokens: null },
      })
      expect(resumed.taskId).toBe(resumeId)
      expect(resumed.attemptId).not.toBeUndefined()
      expect(resumed.pagesFetched).toBeGreaterThanOrEqual(4)
      const steps = await reopened.listSteps(resumed.taskId)
      const urls = new Set(steps.map((s) => s.canonicalUrl))
      expect(urls.has(seed)).toBe(true)
      expect(urls.has(`${server.url}/crawl/item/1`)).toBe(true)
      expect(urls.has(`${server.url}/crawl/item/2`)).toBe(true)
      expect(urls.has(`${server.url}/crawl/item/3`)).toBe(true)
      expect(join(dir, CHECKPOINT_FILENAME)).toBe(`${dir}/${CHECKPOINT_FILENAME}`)
    } finally {
      await Promise.all(resumeChannels.map((c) => c.close?.().catch(() => {})))
      await reopened.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('w2l crawl --resume keeps the page budget of the task it resumes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-crawl-cli-resume-'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const seed = `${server.url}/crawl/listing`
      expect(await runCrawl(parseCrawlArgs(['--max-pages', '2', '--task-dir', dir, seed]))).toBe(0)
      // No flags: the stored budget still holds, so the resume adds no third page.
      expect(await runCrawl(parseCrawlArgs(['--resume', dir]))).toBe(0)
      await expect(runCrawl(parseCrawlArgs(['--resume', dir, '--max-pages', '10']))).rejects.toThrow(/--max-pages 10/)
      const store = SqliteTaskStore.open(dir)
      try {
        const task = (await store.listTasks())[0]!
        expect(new Set((await store.listSteps(task.id)).map((step) => step.canonicalUrl)).size).toBe(2)
        expect(await store.listAttempts(task.id)).toHaveLength(2)
      } finally {
        await store.close()
      }
    } finally {
      log.mockRestore()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('fills rawBodySha256 on the HTTP arm for identical fixture bodies', async () => {
    const host = new URL(server.url).hostname
    const policy = { mode: 'standard' as const, allowlistedDomains: [host] }
    const channels = buildChannels('standard', {
      localSubjects: { browser_local: { fetch: async () => { throw new Error('CI crawl must stay on HTTP; browser arm was reached') } } },
    })
    const runner = new LadderRunner(channels, policy, new MemoryRoutingHistory())
    const atom = new LadderScrapeAtom(runner)
    try {
      const a = await atom.scrape(`${server.url}/duplicate/a`)
      const b = await atom.scrape(`${server.url}/duplicate/b`)
      expect(a.result.evidence.rawBodySha256).toMatch(/^[0-9a-f]{64}$/)
      expect(b.result.evidence.rawBodySha256).toBe(a.result.evidence.rawBodySha256)
    } finally {
      await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
    }
  })

  it('resumes a kill before the first contentful step by reseeding the seed URL', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-crawl-empty-'))
    const seed = `${server.url}/crawl/listing`
    const host = new URL(server.url).hostname
    const policy = { mode: 'standard' as const, allowlistedDomains: [host] }
    const now = new Date().toISOString()
    const taskId = crypto.randomUUID()
    const killed = SqliteTaskStore.open(dir)
    try {
      await killed.putTask({
        id: taskId,
        seedUrl: seed,
        taskDir: dir,
        mode: 'standard',
        status: 'running',
        budget: { maxPages: null, maxWallMs: null, maxCostUsd: null, maxTokens: null },
        createdAt: now,
        updatedAt: now,
      })
      await killed.putAttempt({
        id: crypto.randomUUID(),
        taskId,
        status: 'running',
        startedAt: now,
        endedAt: null,
        pagesFetched: 0,
        wallMs: 0,
        costUsd: 0,
        contentTokens: 0,
        budgetExceeded: null,
      })
      expect(await killed.listSteps(taskId)).toEqual([])
    } finally {
      await killed.close()
    }

    const reopened = SqliteTaskStore.open(dir)
    const resumeChannels = buildChannels('standard', {
      localSubjects: { browser_local: { fetch: async () => { throw new Error('CI crawl must stay on HTTP; browser arm was reached') } } },
    })
    const resumeRunner = new LadderRunner(resumeChannels, policy, new MemoryRoutingHistory())
    const resumeAtom = new LadderScrapeAtom(resumeRunner)
    const second = new CrawlOrchestrator({ store: reopened, atom: resumeAtom })
    try {
      const resumed = await second.run({
        seedUrl: seed,
        taskDir: dir,
        resumeFrom: taskId,
        allowlistedDomains: [host],
        budget: { maxPages: 20, maxWallMs: null, maxCostUsd: null, maxTokens: null },
      })
      expect(resumed.taskId).toBe(taskId)
      expect(resumed.status).toBe('completed')
      expect(resumed.pagesFetched).toBeGreaterThanOrEqual(4)
      const steps = await reopened.listSteps(resumed.taskId)
      const urls = new Set(steps.map((s) => s.canonicalUrl))
      expect(urls.has(seed)).toBe(true)
      expect(urls.has(`${server.url}/crawl/item/1`)).toBe(true)
      expect(urls.has(`${server.url}/crawl/item/2`)).toBe(true)
      expect(urls.has(`${server.url}/crawl/item/3`)).toBe(true)
    } finally {
      await Promise.all(resumeChannels.map((c) => c.close?.().catch(() => {})))
      await reopened.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
