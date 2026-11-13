import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  DEFAULT_CRAWL_BUDGET,
  type Attempt,
  type FetchResult,
  type ListPageRead,
  type PaidCallRecord,
  type StepRecord,
  type Task,
} from '@w2l/contracts'
import { notServedSteps } from '../src/crawlReport.js'
import { CHECKPOINT_FILENAME, MemoryTaskStore, SqliteTaskStore, type TaskStore } from '../src/index.js'

const NOW = '2026-09-18T00:00:00.000Z'
const LATER = '2026-09-18T00:01:00.000Z'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    seedUrl: 'https://example.com/',
    taskDir: '/tmp/w2l-task',
    mode: 'standard',
    status: 'running',
    budget: DEFAULT_CRAWL_BUDGET,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 'attempt-1',
    taskId: 'task-1',
    status: 'running',
    startedAt: NOW,
    endedAt: null,
    pagesFetched: 0,
    wallMs: 0,
    costUsd: 0,
    contentTokens: 0,
    budgetExceeded: null,
    ...overrides,
  }
}

function pageResult(url: string): FetchResult {
  return {
    requestedUrl: url,
    status: 'success',
    failureReason: null,
    blockReason: null,
    budgetExceeded: null,
    lane: 'http',
    escalations: [],
    handoff: null,
    markdown: 'MAIN',
    truncated: false,
    truncatedAt: null,
    compliance: null,
    evidence: {
      finalUrl: url,
      httpStatus: 200,
      redirectChain: [],
      contentType: 'text/html',
      rawBodySha256: 'abc',
      artifacts: [],
    },
    usage: {
      wallMs: 12,
      bytesWire: 100,
      bytesDecompressed: 100,
      requestCount: 1,
      attemptCount: 1,
      contentTokens: 4,
      browserMs: 0,
      externalCostUsd: null,
    },
    trace: [],
  }
}

function step(overrides: Partial<StepRecord> = {}): StepRecord {
  const url = overrides.url ?? 'https://example.com/'
  return {
    id: 'step-1',
    taskId: 'task-1',
    attemptId: 'attempt-1',
    url,
    canonicalUrl: url,
    depth: 0,
    status: 'success',
    lane: 'http',
    contentHash: 'abc',
    cached: false,
    result: pageResult(url),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

const sqlMethods = ['exec', 'prepare', 'pragma', 'transaction', 'serialize'] as const

function expectNoSqlSurface(store: TaskStore): void {
  const exposed = sqlMethods.filter((name) => typeof (store as unknown as Record<string, unknown>)[name] === 'function')
  expect(exposed, 'TaskStore must not leak a SQL handle onto the caller').toEqual([])
}

async function seed(store: TaskStore): Promise<void> {
  await store.putTask(task())
  await store.putAttempt(attempt())
}

function runStoreContract(name: string, open: () => Promise<{ store: TaskStore; cleanup: () => Promise<void> }>): void {
  describe(name, () => {
    let store: TaskStore
    let cleanup: () => Promise<void>

    afterEach(async () => {
      await store.close()
      await cleanup()
    })

    it('keeps the pages a list step read for a URL, in order and each once, until they are cleared with its step', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      const read = (step: number, page: number, url: string): ListPageRead => ({ step, page, url, html: `<ul><li>${page}</li></ul>`, state: `s${page}`, items: `i${page}`, itemRefs: null, count: 1 })
      await store.putPageRead('task-1', 'https://example.com/list', read(0, 2, 'https://example.com/list?p=2'))
      await store.putPageRead('task-1', 'https://example.com/list', read(0, 1, 'https://example.com/list'))
      await store.putPageRead('task-1', 'https://example.com/other', read(0, 1, 'https://example.com/other'))
      // The same page told again replaces what was kept.
      await store.putPageRead('task-1', 'https://example.com/list', { ...read(0, 2, 'https://example.com/list?p=2'), html: '<ul><li>two</li></ul>' })
      expect(await store.listPagesRead('task-1', 'https://example.com/list')).toEqual([read(0, 1, 'https://example.com/list'), { ...read(0, 2, 'https://example.com/list?p=2'), html: '<ul><li>two</li></ul>' }])
      await store.clearPagesRead('task-1', 'https://example.com/list')
      expect(await store.listPagesRead('task-1', 'https://example.com/list')).toEqual([])
      expect(await store.listPagesRead('task-1', 'https://example.com/other')).toHaveLength(1)
    })

    it('keeps a task\'s paid calls by id, each write replacing the row, and refuses one of an unknown attempt (PA E2)', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      const call: PaidCallRecord = { paidCallId: 'task-1-attempt-1-1', taskId: 'task-1', attemptId: 'attempt-1', url: 'https://example.com/p', vendorId: 'steel', ceilingUsd: 0.3, state: 'reserved', chargedUsd: null, providerRequestId: null, providerSessionId: null, tariffVersion: 'abc', grantHash: 'f'.repeat(64), deadline: LATER, createdAt: NOW, settledAt: null }
      await store.putPaidCall(call)
      await store.putPaidCall({ ...call, paidCallId: 'task-1-attempt-1-2', createdAt: LATER })
      const settled = { ...call, state: 'settled' as const, chargedUsd: 0.012, providerSessionId: 'sess-1', providerRequestId: 'sess-1', settledAt: LATER }
      await store.putPaidCall(settled)
      expect(await store.listPaidCalls('task-1')).toEqual([settled, { ...call, paidCallId: 'task-1-attempt-1-2', createdAt: LATER }])
      expect(await store.listPaidCalls('task-1', 'attempt-1')).toHaveLength(2)
      expect(await store.listPaidCalls('task-1', 'attempt-2')).toEqual([])
      await expect(store.putPaidCall({ ...call, paidCallId: 'x', attemptId: 'attempt-9' })).rejects.toThrow('unknown attempt')
    })

    it('round-trips task, attempt, and a URL-granularity step', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      await store.putStep(step())

      expect(await store.getTask('task-1')).toEqual(task())
      expect(await store.listTasks()).toEqual([task()])
      expect(await store.getAttempt('attempt-1')).toEqual(attempt())
      expect(await store.getStep('step-1')).toEqual(step())
      expect(await store.listAttempts('task-1')).toEqual([attempt()])
      expect(await store.listSteps('task-1')).toEqual([step()])
      expect(await store.listSteps('task-1', 'attempt-1')).toEqual([step()])
      expect(await store.getStepByCanonicalUrl('task-1', 'https://example.com/')).toEqual(step())
    })

    it('round-trips every crawl option a resume needs on the task', async () => {
      ;({ store, cleanup } = await open())
      const crawl = task({
        budget: { ...DEFAULT_CRAWL_BUDGET, maxPages: 20 },
        crawl: { formats: ['markdown', 'links'], includeLinks: false, includePaths: ['^/docs/'], excludePaths: ['^/docs/old/'], maxDepth: null, allowlistedDomains: ['example.com'], useCached: true, onlyMainContent: false, waitFor: 500, timeout: 20_000 },
      })
      await store.putTask(crawl)
      expect(await store.getTask('task-1')).toEqual(crawl)
    })

    it('round-trips the hosts\' pace a resumed run keeps, and a task without one', async () => {
      ;({ store, cleanup } = await open())
      const paced = task({ pacing: { 'example.com': { lastStartedAtMs: 1_790_000_000_000, crawlDelayMs: 2_000 }, 'other.test': { lastStartedAtMs: 1_790_000_000_500, crawlDelayMs: null } } })
      await store.putTask(paced)
      expect(await store.getTask('task-1')).toEqual(paced)
      await store.putTask(task())
      expect(await store.getTask('task-1')).toEqual(task())
    })

    it('writes a task\'s pace alone with putTaskPacing: a status another writer set meanwhile stays', async () => {
      ;({ store, cleanup } = await open())
      await store.putTask(task())
      // Another writer (a cancel from another process) lands between the run's read and its pacing write.
      await store.putTask({ ...task(), status: 'cancelled' })
      const pacing = { 'example.com': { lastStartedAtMs: 1_790_000_000_000, crawlDelayMs: null, cooldownUntilMs: 1_790_000_002_000, adaptive: { ceiling: 1, delayMs: 2_000, signals: 0, okStreak: 0, slowdowns: 1 } } }
      await store.putTaskPacing!('task-1', pacing, LATER)
      expect(await store.getTask('task-1')).toEqual({ ...task(), status: 'cancelled', pacing, updatedAt: LATER })
    })

    it('lists when an attempt\'s latest steps were written, newest first, without reading their bodies', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      for (const n of [1, 2, 3]) await store.putStep(step({ id: `step-${n}`, url: `https://example.com/${n}`, canonicalUrl: `https://example.com/${n}`, createdAt: `2026-09-18T00:00:0${n}.000Z` }))
      expect(await store.listRecentStepTimes('task-1', 'attempt-1', 2)).toEqual(['2026-09-18T00:00:03.000Z', '2026-09-18T00:00:02.000Z'])
      expect(await store.listRecentStepTimes('task-1', 'attempt-other', 2)).toEqual([])
    })

    it('counts unique completed URLs and pages all outcomes without loading bodies for status', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      await store.putStep(step())
      await store.putStep(step({ id: 'step-2', result: pageResult('https://example.com/'), createdAt: LATER }))
      await store.putStep(step({ id: 'step-3', url: 'https://example.com/other', canonicalUrl: 'https://example.com/other', status: 'failed', result: null, createdAt: LATER }))
      // A page read without content (a 204) is a completed URL with its own outcome, which the batch status counts as succeeded.
      const empty = pageResult('https://example.com/empty')
      await store.putStep(step({ id: 'step-4', url: empty.requestedUrl, canonicalUrl: empty.requestedUrl, status: 'empty_verified', result: { ...empty, status: 'empty_verified', markdown: null, evidence: { ...empty.evidence, httpStatus: 204 } }, createdAt: LATER }))
      expect(await store.countCompletedSteps('task-1')).toBe(2)
      expect((await store.listStepsPage('task-1', { limit: 10, kind: 'all' })).steps).toHaveLength(4)
      expect(await store.countSteps('task-1', 'attempt-1')).toEqual({ success: 2, failed: 1, empty_verified: 1 })
      expect(await store.countSteps('task-1')).toEqual({ success: 2, failed: 1, empty_verified: 1 })
      expect(await store.countSteps('task-1', 'attempt-2')).toEqual({})
    })

    it('counts the steps that passed the task contract and those that did not, a step stored without one and no duplicate among them', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      const judged = (status: 'passed' | 'failed') => ({ ...pageResult('https://example.com/'), verification: { status, verifier: 'verify/1', contractSha256: 'a'.repeat(64), reason: status === 'passed' ? null : 'checks_failed' as const, checks: [] } })
      await store.putStep(step({ result: judged('passed') }))
      await store.putStep(step({ id: 'step-2', result: judged('failed'), createdAt: LATER }))
      await store.putStep(step({ id: 'step-3', url: 'https://example.com/other', canonicalUrl: 'https://example.com/other', status: 'failed', result: null, createdAt: LATER }))
      await store.putStep(step({ id: 'step-4', url: 'https://example.com/copy', canonicalUrl: 'https://example.com/copy', status: 'duplicate', result: { ...judged('passed'), status: 'duplicate' }, createdAt: LATER }))
      expect(await store.countVerifications('task-1')).toEqual({ verified: 1, verificationFailed: 2 })
      expect(await store.countVerifications('task-1', 'attempt-1')).toEqual({ verified: 1, verificationFailed: 2 })
      expect(await store.countVerifications('task-1', 'attempt-2')).toEqual({ verified: 0, verificationFailed: 0 })
    })

    it('counts as not served a page read without the login, as it does a page sent away', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      const warned = (code: string) => ({ ...pageResult('https://example.com/a/b'), lane: 'my_browser' as const, warnings: [{ code, message: code }] })
      await store.putStep(step({ result: warned('sign_in_prompt') }))
      await store.putStep(step({ id: 'step-2', url: 'https://example.com/other', canonicalUrl: 'https://example.com/other', result: warned('redirected_off_page'), createdAt: LATER }))
      await store.putStep(step({ id: 'step-3', url: 'https://example.com/plain', canonicalUrl: 'https://example.com/plain', result: pageResult('https://example.com/plain'), createdAt: LATER }))
      expect((await notServedSteps(store, 'task-1')).map(({ code }) => code).sort()).toEqual(['redirected_off_page', 'sign_in_prompt'])
    })

    it('counts the steps that carry a warning of a code, among those succeeded and failed count, each once', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      const warned = (...codes: string[]) => ({ ...pageResult('https://example.com/a/b'), warnings: codes.map((code) => ({ code, message: code })) })
      await store.putStep(step({ result: warned('robots_overridden', 'redirected_off_page') }))
      await store.putStep(step({ id: 'step-2', url: 'https://example.com/other', canonicalUrl: 'https://example.com/other', result: warned('redirected_off_page', 'redirected_off_page'), createdAt: LATER }))
      await store.putStep(step({ id: 'step-3', url: 'https://example.com/plain', canonicalUrl: 'https://example.com/plain', result: pageResult('https://example.com/plain'), createdAt: LATER }))
      await store.putStep(step({ id: 'step-4', url: 'https://example.com/none', canonicalUrl: 'https://example.com/none', status: 'failed', result: null, createdAt: LATER }))
      await store.putStep(step({ id: 'step-5', url: 'https://example.com/copy', canonicalUrl: 'https://example.com/copy', status: 'duplicate', result: { ...warned('redirected_off_page'), status: 'duplicate' }, createdAt: LATER }))
      expect(await store.countStepsWarned('task-1', 'redirected_off_page')).toBe(2)
      expect(await store.countStepsWarned('task-1', 'redirected_off_page', 'attempt-1')).toBe(2)
      expect(await store.countStepsWarned('task-1', 'redirected_off_page', 'attempt-2')).toBe(0)
      expect(await store.countStepsWarned('task-1', 'robots_overridden')).toBe(1)
      expect(await store.countStepsWarned('task-1', 'redirected_off')).toBe(0)
    })

    it('counts the read pages whose json has an issue of a code and message, by path, each page once a path', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      const NO_SOURCE = 'no verified source'
      const extracted = (url: string, issues: Array<{ path?: string; message: string }>) => ({ ...pageResult(url), json: { status: 'complete' as const, data: {}, evidence: [], issues: issues.map((issue) => ({ code: 'field_unavailable' as const, ...issue })), modelUsage: null } })
      await store.putStep(step({ result: extracted('https://example.com/a/b', [{ path: '/license', message: NO_SOURCE }, { path: '/license', message: NO_SOURCE }, { path: '/stars', message: NO_SOURCE }]) }))
      await store.putStep(step({ id: 'step-2', url: 'https://example.com/other', canonicalUrl: 'https://example.com/other', result: extracted('https://example.com/other', [{ path: '/license', message: NO_SOURCE }, { path: '/price', message: 'breaks minimum' }]), createdAt: LATER }))
      await store.putStep(step({ id: 'step-3', url: 'https://example.com/root', canonicalUrl: 'https://example.com/root', result: extracted('https://example.com/root', [{ message: NO_SOURCE }]), createdAt: LATER }))
      await store.putStep(step({ id: 'step-4', url: 'https://example.com/gone', canonicalUrl: 'https://example.com/gone', status: 'failed', result: { ...extracted('https://example.com/gone', [{ path: '/license', message: NO_SOURCE }]), status: 'failed' }, createdAt: LATER }))
      // A page a model filled in, or tried to, is not counted: its null is the model's answer.
      await store.putStep(step({ id: 'step-5', url: 'https://example.com/model', canonicalUrl: 'https://example.com/model', result: { ...extracted('https://example.com/model', [{ path: '/license', message: NO_SOURCE }]), json: { ...extracted('https://example.com/model', [{ path: '/license', message: NO_SOURCE }]).json, modelUsage: { model: 'test-model', attempts: 1, inputTokens: null, outputTokens: null, externalCostUsd: null } } }, createdAt: LATER }))
      expect(await store.countJsonIssuePaths('task-1', 'field_unavailable', NO_SOURCE)).toEqual({ '/license': 2, '/stars': 1, '': 1 })
      expect(await store.countJsonIssuePaths('task-1', 'missing_required', NO_SOURCE)).toEqual({})
      expect(await store.countJsonIssuePaths('task-2', 'field_unavailable', NO_SOURCE)).toEqual({})
    })

    it('finds the steps whose trace has an event by name, without a lookalike name or another task\'s', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      const traced = (event: string) => ({ ...pageResult('https://example.com/'), trace: [{ at: 0, lane: 'browser_local_authed' as const, event, detail: {} }] })
      await store.putStep(step({ id: 'step-1', result: traced('handoff_from') }))
      await store.putStep(step({ id: 'step-2', result: traced('handoffXfrom'), createdAt: LATER }))
      await store.putStep(step({ id: 'step-3', result: null, status: 'failed', createdAt: LATER }))
      await store.putStep(step({ id: 'step-4', result: traced('handoff_from'), createdAt: LATER }))
      expect(await store.listStepIdsWithTraceEvent('task-1', 'handoff_from')).toEqual(['step-1', 'step-4'])
      expect(await store.listStepIdsWithTraceEvent('task-2', 'handoff_from')).toEqual([])
    })

    it('is idempotent: the same (taskId, attemptId, stepId) does not create a second row', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      await store.putTask(task())
      await store.putAttempt(attempt())
      await store.putStep(step())
      await store.putStep(step({ status: 'failed', result: null, contentHash: null, updatedAt: LATER }))

      expect(await store.listAttempts('task-1')).toHaveLength(1)
      expect(await store.listSteps('task-1')).toHaveLength(1)
      const stored = await store.getStep('step-1')
      expect(stored?.status).toBe('failed')
      expect(stored?.updatedAt).toBe(LATER)
      expect(stored?.result).toBeNull()
    })

    it('rejects empty caller ids instead of inventing a database key', async () => {
      ;({ store, cleanup } = await open())
      await expect(store.putTask(task({ id: '' }))).rejects.toThrow(/non-empty caller-generated id/)
    })

    it('refuses an attempt or step whose parent does not exist', async () => {
      ;({ store, cleanup } = await open())
      await expect(store.putAttempt(attempt())).rejects.toThrow(/unknown task/)
      await store.putTask(task())
      await expect(store.putStep(step())).rejects.toThrow(/unknown attempt/)
    })

    it('refuses a step whose attempt belongs to a different task', async () => {
      ;({ store, cleanup } = await open())
      await store.putTask(task())
      await store.putTask(task({ id: 'task-2', seedUrl: 'https://other.example/' }))
      await store.putAttempt(attempt({ id: 'attempt-2', taskId: 'task-2' }))
      await expect(store.putStep(step({ attemptId: 'attempt-2' }))).rejects.toThrow(/belongs to task task-2/)
    })

    it('returns the latest step for a canonical URL across attempts', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      await store.putAttempt(attempt({ id: 'attempt-2', startedAt: LATER }))
      await store.putStep(step({ contentHash: 'old' }))
      await store.putStep(
        step({
          id: 'step-2',
          attemptId: 'attempt-2',
          contentHash: 'new',
          updatedAt: LATER,
          result: pageResult('https://example.com/'),
        }),
      )

      const latest = await store.getStepByCanonicalUrl('task-1', 'https://example.com/')
      expect(latest?.id).toBe('step-2')
      expect(latest?.contentHash).toBe('new')
      expect(await store.listSteps('task-1', 'attempt-1')).toHaveLength(1)
      expect(await store.listSteps('task-1', 'attempt-2')).toHaveLength(1)
    })

    it('stores one step per URL, never a page fragment', async () => {
      ;({ store, cleanup } = await open())
      await seed(store)
      await store.putStep(step())
      const stored = await store.getStep('step-1')
      expect(stored?.url).toBe('https://example.com/')
      expect(stored).not.toHaveProperty('chunkId')
      expect(stored).not.toHaveProperty('blockId')
    })

    it('does not expose a SQL handle on the TaskStore object', async () => {
      ;({ store, cleanup } = await open())
      expectNoSqlSurface(store)
    })
  })
}

runStoreContract('MemoryTaskStore', async () => ({
  store: new MemoryTaskStore(),
  cleanup: async () => {},
}))

runStoreContract('SqliteTaskStore', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'w2l-checkpoint-'))
  return {
    store: SqliteTaskStore.open(dir),
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true })
    },
  }
})

describe('SqliteTaskStore file layout', () => {
  it('writes checkpoint.sqlite next to the task directory with 0600', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-checkpoint-'))
    const store = SqliteTaskStore.open(dir)
    try {
      await store.putTask(task({ taskDir: dir }))
      const file = join(dir, CHECKPOINT_FILENAME)
      const info = await stat(file)
      expect(info.isFile()).toBe(true)
      expect(info.mode & 0o777).toBe(0o600)
    } finally {
      await store.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reopens the same file and sees prior rows', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-checkpoint-'))
    const first = SqliteTaskStore.open(dir)
    try {
      await first.putTask(task({ taskDir: dir }))
      await first.putAttempt(attempt())
      await first.putStep(step())
    } finally {
      await first.close()
    }

    const second = SqliteTaskStore.open(dir)
    try {
      expect((await second.getTask('task-1'))?.seedUrl).toBe('https://example.com/')
      expect(await second.listSteps('task-1')).toHaveLength(1)
    } finally {
      await second.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('SqliteTaskStore paid_calls migration (PA E2)', () => {
  it('adds the table to a checkpoint written before it existed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-checkpoint-'))
    try {
      const first = SqliteTaskStore.open(dir)
      await first.putTask(task({ taskDir: dir }))
      await first.putAttempt(attempt())
      await first.close()
      // A checkpoint from before PA E2: no paid_calls table.
      const old = new Database(join(dir, CHECKPOINT_FILENAME))
      old.exec('DROP TABLE paid_calls')
      old.close()
      const reopened = SqliteTaskStore.open(dir)
      expect(await reopened.listPaidCalls('task-1')).toEqual([])
      await reopened.putPaidCall({ paidCallId: 'p1', taskId: 'task-1', attemptId: 'attempt-1', url: 'https://example.com/', vendorId: 'steel', ceilingUsd: 1, state: 'unknown', chargedUsd: null, providerRequestId: null, providerSessionId: null, tariffVersion: null, grantHash: null, deadline: null, createdAt: NOW, settledAt: NOW })
      expect(await reopened.listPaidCalls('task-1')).toHaveLength(1)
      await reopened.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('@w2l/runtime public surface', () => {
  it('exports the store seam and both backends, not a SQL dialect', async () => {
    const runtime = await import('../src/index.js')
    expect(Object.keys(runtime).sort()).toEqual([
      'CHECKPOINT_FILENAME',
      'CrawlOrchestrator',
      'DeliveryStore',
      'DeliveryWorker',
      'FIRST_SLOW_DELAY_MS',
      'Frontier',
      'IDEMPOTENCY_FILENAME',
      'IdempotencyStore',
      'InvalidCursorError',
      'MAX_SLOW_DELAY_MS',
      'MapRunner',
      'MemoryTaskStore',
      'MonitorStore',
      'OK_PAGES_TO_RECOVER',
      'PageCache',
      'READ_STATUSES',
      'REGEX_SCAN_LIMIT_MS',
      'REGEX_STEERING_POOL_MS',
      'REGEX_VERIFY_POOL_MS',
      'ROUTE_VERIFIER_VERSION',
      'RecipeStore',
      'RegexLedger',
      'RegexPool',
      'SHELL_TEXT_MAX',
      'SIGNALS_TO_SLOW',
      'SqliteTaskStore',
      'StoreRefusal',
      'VERIFIER_VERSION',
      'WebhookInbox',
      'assessConfiguredDocument',
      'assessFirecrawlIntroduction',
      'cacheHitResult',
      'cacheMissResult',
      'canonicalizeUrl',
      'compilePathFilter',
      'contractSha256',
      'crawlReportFromStore',
      'createHttpsWebhookTransport',
      'currentRegexLedger',
      'decodeStepCursor',
      'diffDocument',
      'encodeStepCursor',
      'enqueueJobDelivery',
      'foldCheckpoint',
      'hostOf',
      'initializeFirecrawlMonitor',
      'initializeMonitor',
      'isLoopbackHostname',
      'notServedSteps',
      'pageCacheKey',
      'parseWebhookRetryAfter',
      'readinessOf',
      'regexBoundSelfTest',
      'registerDeliveryDestination',
      'reportFromTaskAttempt',
      'requestFingerprint',
      'runConfiguredMonitor',
      'runFirecrawlMonitor',
      'softBlockSignal',
      'sourceCommitFromEnv',
      'systemClock',
      'toEvidenceRecord',
      'untriedAudit',
      'validateDestinationUrl',
      'verify',
      'verifyWebhookSignature',
      'visitKey',
      'webhookSignature',
      'withCacheMiss',
      'withCacheStored',
      'withRegexLedger',
    ])
    expect(runtime).not.toHaveProperty('SCHEMA')
    expect(runtime).not.toHaveProperty('Database')
  })
})
