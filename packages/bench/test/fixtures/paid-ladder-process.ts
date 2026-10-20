/**
 * One crawl run in its own process, for paidFaults.test.ts (PA E7): a CrawlOrchestrator over a SqliteTaskStore whose
 * pages go through the real LadderRunner to one Steel rung. The rung's provider is simulated in a JSON file
 * (PAID_PROVIDER) that both this process and the test read: sessions it was asked to create, by name, with their state
 * and cost. A resumed run settles open calls through the real Steel reconciler, over an API that answers from that file.
 *
 * PAID_KILL kills this process with SIGKILL, as a crash would: `after_reserve` (the reserved row written, no session
 * asked for), `after_session` (the provider's session created and live), `after_page` (the page back and the session
 * released, its settled row not yet written) or `before_put_step` (the call settled, the page's step not yet written).
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { DEFAULT_CRAWL_BUDGET, identityBundleFrom, modeIdentity, type FetchResult } from '../../../contracts/src/index.js'
import { CrawlOrchestrator } from '../../../runtime/src/orchestrator.js'
import { SqliteTaskStore } from '../../../runtime/src/sqliteStore.js'
import type { TaskStore } from '../../../runtime/src/taskStore.js'
import { LadderRunner, type Channel } from '../../src/routing/ladder.js'
import { LadderScrapeAtom } from '../../src/scrapeAtom.js'
import type { VendorApi } from '../../src/vendors/api.js'
import { namedForPaidCall, steelPaidCallReconciler } from '../../src/vendors/paidSessions.js'
import type { VendorOps } from '../../src/vendors/transport.js'

const SEED = 'https://paid.example.com/'
const env = process.env
const taskDir = env.PAID_DIR!
const providerFile = env.PAID_PROVIDER!
const kill = env.PAID_KILL ?? ''
const ceilingUsd = Number(env.PAID_CEILING ?? '0.5')
const budgetUsd = Number(env.PAID_BUDGET ?? '1')
/** What the provider bills a session, and what the page's answer reports measured (they agree unless set apart). */
const sessionCostUsd = Number(env.PAID_COST ?? '0.2')
const measuredUsd = env.PAID_MEASURED === undefined ? sessionCostUsd : Number(env.PAID_MEASURED)

export interface ProviderState {
  sessions: Record<string, { status: 'live' | 'released'; costUsd: number }>
  /** Every create the provider was asked for, by name, refused ones included. */
  creates: string[]
}

function readState(): ProviderState {
  return existsSync(providerFile) ? JSON.parse(readFileSync(providerFile, 'utf8')) as ProviderState : { sessions: {}, creates: [] }
}
function writeState(state: ProviderState): void {
  writeFileSync(`${providerFile}.tmp`, JSON.stringify(state))
  renameSync(`${providerFile}.tmp`, providerFile)
}

function crash(): never {
  process.kill(process.pid, 'SIGKILL')
  throw new Error('unreachable')
}

/** The simulated provider's session API, as Steel's ops would call it: a name Steel already has is refused (409). */
const ops: VendorOps = {
  vendorId: 'steel', secrets: [], decision: { enabled: [], refused: [] } as unknown as VendorOps['decision'], namesSessions: true,
  async createSession(_resume, _deadline, _signal, name) {
    const state = readState()
    const id = name ?? `steel-${state.creates.length + 1}`
    state.creates.push(id)
    if (state.sessions[id] !== undefined) { writeState(state); throw new Error('steel: session create returned 409') }
    state.sessions[id] = { status: 'live', costUsd: sessionCostUsd }
    writeState(state)
    return { sessionId: id, connectUrl: 'wss://steel.invalid', handoffUrl: null, resumeContext: null }
  },
  async releaseSession(id) {
    const state = readState()
    if (state.sessions[id] !== undefined) state.sessions[id]!.status = 'released'
    writeState(state)
  },
}

/** Steel's REST API over the same file, for the reconciler; PAID_BILLING_DOWN makes its cost endpoint answer 503. */
const api: VendorApi = async (req) => {
  const [, id, tail] = /\/v1\/sessions\/([^/]+)(\/.*)?$/.exec(new URL(req.url).pathname) ?? []
  const state = readState()
  const session = id === undefined ? undefined : state.sessions[decodeURIComponent(id)]
  if (session === undefined) return { status: 404, json: null }
  if (tail === undefined) return { status: 200, json: { id, status: session.status } }
  if (tail === '/release') { await ops.releaseSession(decodeURIComponent(id!)); return { status: 200, json: { success: true } } }
  if (tail === '/cost') return env.PAID_BILLING_DOWN === '1' || session.status !== 'released' ? { status: env.PAID_BILLING_DOWN === '1' ? 503 : 409, json: null } : { status: 200, json: { id, currency: 'usd', totalCost: session.costUsd } }
  return { status: 400, json: null }
}

function page(url: string): FetchResult {
  return {
    requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'provider', escalations: [], markdown: `MAIN ${url}`, links: [],
    truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: url, artifacts: [] },
    usage: { wallMs: 5, bytesWire: 10, bytesDecompressed: 10, requestCount: 1, attemptCount: 1, contentTokens: 4, browserMs: 0, externalCostUsd: null, measuredCostUsd: measuredUsd, vendorSessionMs: 1_000 },
    trace: [],
  }
}

/** The Steel rung: one session per call, opened as the real vendor channel opens it (named from the call), then released. */
const steel: Channel = {
  id: 'provider', vendorId: 'steel', priceCeilingUsd: ceilingUsd, identity: identityBundleFrom(modeIdentity('standard')), tariffVersion: 'fixture',
  async fetch(url, _session, execution) {
    const named = namedForPaidCall(ops, execution)
    const session = await named.createSession(null)
    if (kill === 'after_session') crash()
    await ops.releaseSession(session.sessionId)
    return page(url)
  },
}

/** The store, with the crash at the chosen point. */
function crashing(store: TaskStore): TaskStore {
  return new Proxy(store, {
    get(target, property, receiver) {
      if (property === 'putPaidCall') return async (...args: Parameters<TaskStore['putPaidCall']>) => {
        const [call] = args
        if (kill === 'after_page' && call.state !== 'reserved' && call.state !== 'submitted') crash()
        await target.putPaidCall(...args)
        if (kill === 'after_reserve' && call.state === 'reserved') crash()
      }
      if (property === 'putStep') return async (...args: Parameters<TaskStore['putStep']>) => {
        if (kill === 'before_put_step') crash()
        await target.putStep(...args)
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

const store = SqliteTaskStore.open(taskDir)
try {
  const runner = new LadderRunner([steel], { mode: 'authed', allowlistedDomains: ['paid.example.com'] })
  const report = await new CrawlOrchestrator({ store: crashing(store), atom: new LadderScrapeAtom(runner), workerCount: 1, reconcilePaidCall: steelPaidCallReconciler({ apiKey: 'fixture' }, api) })
    .run({ seedUrl: SEED, taskDir, budget: { ...DEFAULT_CRAWL_BUDGET, maxCostUsd: budgetUsd }, resumeFrom: env.PAID_RESUME ?? null })
  process.stdout.write(JSON.stringify(report))
} finally {
  await store.close()
}
