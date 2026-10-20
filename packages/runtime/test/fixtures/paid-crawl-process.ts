/**
 * One crawl run in its own process, for paidRecovery.test.ts: a CrawlOrchestrator over a SqliteTaskStore whose one page
 * makes one paid call (a $1 ceiling, charged at it). The paid call goes to a fake provider that appends a line to
 * PAID_TEST_CALLS, so the test counts every call across processes. With PAID_TEST_KILL the store kills this process
 * with SIGKILL at that point, as a crash would: `before_put_step` (the call settled, the page not yet written) or
 * `before_put_attempt` (the page written, the attempt's counters not yet).
 */
import { appendFileSync } from 'node:fs'
import { DEFAULT_CRAWL_BUDGET, type ExecutionContext, type FetchResult, type ScrapeAtom, type ScrapeOutcome } from '../../../contracts/src/index.js'
import { CrawlOrchestrator } from '../../src/orchestrator.js'
import { SqliteTaskStore } from '../../src/sqliteStore.js'
import type { TaskStore } from '../../src/taskStore.js'

const SEED = 'https://paid.test/'
const taskDir = process.env.PAID_TEST_DIR!
const callsFile = process.env.PAID_TEST_CALLS!
const kill = process.env.PAID_TEST_KILL ?? ''
const resumeFrom = process.env.PAID_TEST_RESUME ?? null

function crash(): never {
  process.kill(process.pid, 'SIGKILL')
  throw new Error('unreachable')
}

/** The store, with the crash at the chosen point. */
function crashing(store: TaskStore): TaskStore {
  let stepWritten = false
  return new Proxy(store, {
    get(target, property, receiver) {
      if (property === 'putStep') return async (...args: Parameters<TaskStore['putStep']>) => {
        if (kill === 'before_put_step') crash()
        await target.putStep(...args)
        stepWritten = true
      }
      if (property === 'putAttempt') return async (...args: Parameters<TaskStore['putAttempt']>) => {
        if (kill === 'before_put_attempt' && stepWritten) crash()
        await target.putAttempt(...args)
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function page(url: string, chargedUsd: number | null): FetchResult {
  return {
    requestedUrl: url, status: chargedUsd === null ? 'budget_exceeded' : 'success', failureReason: null, blockReason: null, budgetExceeded: chargedUsd === null ? 'cost' : null,
    lane: 'provider', escalations: [], markdown: chargedUsd === null ? null : `MAIN ${url}`, links: [], truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: chargedUsd === null ? null : 200, redirectChain: [], contentType: 'text/html', rawBodySha256: chargedUsd === null ? null : url, artifacts: [] },
    usage: { wallMs: 5, bytesWire: 10, bytesDecompressed: 10, requestCount: 1, attemptCount: 1, contentTokens: 4, browserMs: 0, externalCostUsd: null, ...(chargedUsd === null ? {} : { externalCostChargedUsd: chargedUsd }) },
    trace: [],
  }
}

/**
 * A page whose one paid call reserves its $1 ceiling first and settles at it, as the ladder makes a provider call: the
 * call's `reserved` row is written before the call goes out, and its `settled` row after.
 */
const atom: ScrapeAtom = {
  async scrape(url: string, context?: ExecutionContext): Promise<ScrapeOutcome> {
    const row = context?.paidCalls?.open({ url, vendorId: 'fake', ceilingUsd: 1 })
    const reservation = context?.spend?.reserve(1) ?? null
    if (reservation === null) return { result: page(url, null), links: [] }
    if (row !== undefined) await context!.paidCalls!.write(row)
    appendFileSync(callsFile, `${url}\n`)
    const charged = reservation.settle(null)
    if (row !== undefined) await context!.paidCalls!.write({ ...row, state: 'settled', chargedUsd: charged, settledAt: new Date().toISOString() })
    return { result: page(url, charged), links: [] }
  },
  async close(): Promise<void> {},
}

const store = SqliteTaskStore.open(taskDir)
try {
  const report = await new CrawlOrchestrator({ store: crashing(store), atom, workerCount: 1 })
    .run({ seedUrl: SEED, taskDir, budget: { ...DEFAULT_CRAWL_BUDGET, maxCostUsd: 1 }, resumeFrom })
  process.stdout.write(JSON.stringify(report))
} finally {
  await store.close()
}
