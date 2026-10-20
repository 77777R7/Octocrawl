import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_CRAWL_BUDGET, type CrawlReport, type ExecutionContext, type FetchResult, type PaidCallRecord, type ScrapeAtom, type ScrapeOutcome } from '@w2l/contracts'
import { MemoryTaskStore } from '../src/memoryStore.js'
import { CrawlOrchestrator } from '../src/orchestrator.js'
import { SqliteTaskStore } from '../src/sqliteStore.js'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

/** Runs paid-crawl-process.ts once; resolves with how it exited and what it printed. */
function run(env: Record<string, string>): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ['--import', 'tsx', resolve('packages/runtime/test/fixtures/paid-crawl-process.ts')], {
    cwd: resolve('.'),
    env: { ...process.env, ...env, TSX_TSCONFIG_PATH: resolve('packages/runtime/test/fixtures/tsconfig.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr?.on('data', (chunk) => { stderr += String(chunk) })
  return new Promise((done) => child.once('exit', (code, signal) => done({ code, signal, stdout, stderr })))
}

function calls(file: string): string[] {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((line) => line !== '') : []
}

describe('a paid call survives a hard crash (PA E1)', () => {
  for (const kill of ['before_put_step', 'before_put_attempt']) {
    it(`does not pay again on resume after a SIGKILL ${kill.replaceAll('_', ' ')}`, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'w2l-paid-recovery-'))
      dirs.push(dir)
      const taskDir = join(dir, 'task')
      const callsFile = join(dir, 'calls.txt')
      const first = await run({ PAID_TEST_DIR: taskDir, PAID_TEST_CALLS: callsFile, PAID_TEST_KILL: kill })
      expect(first.signal, first.stderr).toBe('SIGKILL')
      expect(calls(callsFile)).toHaveLength(1)

      const store = SqliteTaskStore.open(taskDir)
      const [task] = await store.listTasks()
      await store.close()
      expect(task).toBeDefined()

      // The budget is $1 and the first run's call was charged its $1 ceiling: the resume has no room for another.
      const resumed = await run({ PAID_TEST_DIR: taskDir, PAID_TEST_CALLS: callsFile, PAID_TEST_RESUME: task!.id })
      expect(resumed.code, resumed.stderr).toBe(0)
      expect(calls(callsFile)).toHaveLength(1)
      const report = JSON.parse(resumed.stdout) as CrawlReport
      expect(report.taskId).toBe(task!.id)
      expect(report.budgetExceeded).toBe('cost')
      // The one call is on the task's record, settled at its ceiling, under the first attempt.
      const after = SqliteTaskStore.open(taskDir)
      const rows = await after.listPaidCalls(task!.id)
      const attempts = await after.listAttempts(task!.id)
      await after.close()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ paidCallId: `${task!.id}-${attempts[0]!.id}-1`, state: 'settled', chargedUsd: 1, ceilingUsd: 1 })
      expect(attempts[0]).toMatchObject({ status: 'interrupted', chargedUsd: 1 })
      expect(report.paidCalls).toEqual({ reservedUsd: 0, knownChargedUsd: 1, unknownExposureUsd: 0, refundableUsd: 0, overCeiling: 0, calls: { settled: 1 } })
    }, 30_000)
  }
})

describe('the paid calls a crashed run left open (PA E4, E5)', () => {
  const SEED = 'https://paid.test/'
  const NOW = '2026-10-20T00:00:00.000Z'
  const page = (url: string): FetchResult => ({
    requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'provider', escalations: [], markdown: `MAIN ${url}`, links: [], truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: url, artifacts: [] },
    usage: { wallMs: 5, bytesWire: 10, bytesDecompressed: 10, requestCount: 1, attemptCount: 1, contentTokens: 4, browserMs: 0, externalCostUsd: null, externalCostChargedUsd: 1 },
    trace: [],
  })
  /** A page that pays $1 when its ceiling fits, as the fixture's; the URLs it paid for are kept. */
  const paying = () => {
    const paid: string[] = []
    const atom: ScrapeAtom = {
      async scrape(url: string, context?: ExecutionContext): Promise<ScrapeOutcome> {
        const reservation = context?.spend?.reserve(1) ?? null
        if (reservation === null) return { result: { ...page(url), status: 'budget_exceeded', budgetExceeded: 'cost', markdown: null, usage: { ...page(url).usage, externalCostChargedUsd: 0 } }, links: [] }
        paid.push(url)
        reservation.settle(null)
        return { result: page(url), links: [] }
      },
      async close(): Promise<void> {},
    }
    return { atom, paid }
  }
  /** A task whose run died with one paid call in this state, and nothing else written after it. */
  async function crashedWith(row: Partial<PaidCallRecord>): Promise<MemoryTaskStore> {
    const store = new MemoryTaskStore()
    await store.putTask({ id: 't', seedUrl: SEED, taskDir: '/tmp/w2l-paid', mode: 'standard', status: 'running', budget: { ...DEFAULT_CRAWL_BUDGET, maxCostUsd: 1.5 }, crawl: { maxDepth: 0, allowlistedDomains: [], includePaths: [], excludePaths: [] }, createdAt: NOW, updatedAt: NOW })
    await store.putAttempt({ id: 'a1', taskId: 't', status: 'running', startedAt: NOW, endedAt: null, pagesFetched: 0, wallMs: 0, costUsd: null, costUnknown: true, contentTokens: 0, contentTokensUnknown: false, budgetExceeded: null })
    await store.putPaidCall({ paidCallId: 't-a1-1', taskId: 't', attemptId: 'a1', url: SEED, vendorId: 'steel', ceilingUsd: 1, state: 'reserved', chargedUsd: null, providerRequestId: null, providerSessionId: null, tariffVersion: null, grantHash: null, deadline: null, createdAt: NOW, settledAt: null, ...row })
    return store
  }
  const resume = (store: MemoryTaskStore, atom: ScrapeAtom, reconcilePaidCall?: (call: PaidCallRecord) => Promise<PaidCallRecord>) =>
    new CrawlOrchestrator({ store, atom, workerCount: 1, ...(reconcilePaidCall === undefined ? {} : { reconcilePaidCall }) }).run({ seedUrl: SEED, taskDir: '/tmp/w2l-paid', budget: { ...DEFAULT_CRAWL_BUDGET, maxCostUsd: 1.5 }, resumeFrom: 't' })

  for (const state of ['reserved', 'submitted'] as const) {
    it(`counts a ${state} call nobody can settle as unknown, at its ceiling, and never releases it`, async () => {
      const store = await crashedWith({ state, ...(state === 'submitted' ? { providerSessionId: 'sess-1' } : {}) })
      const { atom, paid } = paying()
      const report = await resume(store, atom)
      // $1 of the $1.50 is held by the unknown call: the next $1 call does not fit.
      expect(paid).toEqual([])
      expect((await store.listPaidCalls('t'))[0]).toMatchObject({ state: 'unknown', chargedUsd: null })
      expect((await store.getAttempt('a1'))).toMatchObject({ status: 'interrupted', chargedUsd: 1, costUsd: null, costUnknown: true })
      expect(report.paidCalls).toEqual({ reservedUsd: 0, knownChargedUsd: 0, unknownExposureUsd: 1, refundableUsd: 0, overCeiling: 0, calls: { unknown: 1 } })
      // A later resume, with a provider that would answer now, leaves the unknown call as it is.
      let asked = 0
      await resume(store, paying().atom, async (call) => { asked++; return { ...call, state: 'released' } })
      expect(asked).toBe(0)
      expect((await store.listPaidCalls('t'))[0]?.state).toBe('unknown')
    })
  }

  it('settles an open call from the provider\'s answer, and the run spends only what is left', async () => {
    const store = await crashedWith({ state: 'submitted', providerSessionId: 'sess-1' })
    const { atom, paid } = paying()
    const asked: PaidCallRecord[] = []
    const report = await resume(store, atom, async (call) => { asked.push(call); return { ...call, state: 'settled', chargedUsd: 0.25, settledAt: NOW } })
    expect(asked.map((call) => call.paidCallId)).toEqual(['t-a1-1'])
    // $0.25 settled, so $1.25 is left: the seed's $1 call fits once.
    expect(paid).toEqual([SEED])
    expect((await store.listPaidCalls('t'))[0]).toMatchObject({ state: 'settled', chargedUsd: 0.25 })
    expect((await store.getAttempt('a1'))?.chargedUsd).toBe(0.25)
    expect(report.paidCalls?.knownChargedUsd).toBe(0.25)
  })

  it('gives a reservation back only when the provider shows the call opened no session', async () => {
    const store = await crashedWith({ state: 'reserved' })
    const { atom, paid } = paying()
    await resume(store, atom, async (call) => ({ ...call, state: 'released', settledAt: NOW }))
    expect(paid).toEqual([SEED])
    expect((await store.listPaidCalls('t'))[0]?.state).toBe('released')
    // A provider that cannot answer leaves the call unknown, not released.
    const unanswered = await crashedWith({ state: 'reserved' })
    await resume(unanswered, paying().atom, async () => { throw new Error('steel down') })
    expect((await unanswered.listPaidCalls('t'))[0]?.state).toBe('unknown')
  })

  it('keeps a usage_pending call at the bound it was charged when the provider cannot settle it', async () => {
    const store = await crashedWith({ state: 'usage_pending', chargedUsd: 0.8, providerSessionId: 'sess-1' })
    const { atom, paid } = paying()
    const report = await resume(store, atom)
    expect((await store.listPaidCalls('t'))[0]).toMatchObject({ state: 'usage_pending', chargedUsd: 0.8 })
    // Held at its $1 ceiling, the larger of the two: the next $1 call does not fit in $1.50.
    expect(paid).toEqual([])
    expect(report.paidCalls).toMatchObject({ unknownExposureUsd: 0.8, calls: { usage_pending: 1 } })
  })
})
