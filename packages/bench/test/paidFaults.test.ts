import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSpendLedger } from '@w2l/http-core'
import { identityBundleFrom, modeIdentity, type CrawlReport, type FetchResult, type PaidCallLog, type PaidCallRecord } from '@w2l/contracts'
import { SqliteTaskStore } from '@w2l/runtime'
import { LadderRunner, type Channel } from '../src/routing/ladder.js'
import { paidSessionName } from '../src/vendors/paidSessions.js'
import type { ProviderState } from './fixtures/paid-ladder-process.js'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

interface Run { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }

/** A task directory and a simulated provider, and a way to run paid-ladder-process.ts on them. */
function task() {
  const dir = mkdtempSync(join(tmpdir(), 'w2l-paid-faults-'))
  dirs.push(dir)
  const taskDir = join(dir, 'task')
  const providerFile = join(dir, 'steel.json')
  const run = (env: Record<string, string> = {}): Promise<Run> => {
    const child = spawn(process.execPath, ['--import', 'tsx', resolve('packages/bench/test/fixtures/paid-ladder-process.ts')], {
      cwd: resolve('.'),
      env: { ...process.env, PAID_DIR: taskDir, PAID_PROVIDER: providerFile, ...env, TSX_TSCONFIG_PATH: resolve('packages/bench/test/fixtures/tsconfig.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr?.on('data', (chunk) => { stderr += String(chunk) })
    return new Promise((done) => child.once('exit', (code, signal) => done({ code, signal, stdout, stderr })))
  }
  const provider = (): ProviderState => existsSync(providerFile) ? JSON.parse(readFileSync(providerFile, 'utf8')) as ProviderState : { sessions: {}, creates: [] }
  const taskId = async (): Promise<string> => {
    const store = SqliteTaskStore.open(taskDir)
    try { return (await store.listTasks())[0]!.id } finally { await store.close() }
  }
  const rows = async (): Promise<readonly PaidCallRecord[]> => {
    const store = SqliteTaskStore.open(taskDir)
    try { return await store.listPaidCalls(await taskId()) } finally { await store.close() }
  }
  return { run, provider, taskId, rows }
}

async function crashed(t: ReturnType<typeof task>, kill: string, env: Record<string, string> = {}): Promise<string> {
  const first = await t.run({ PAID_KILL: kill, ...env })
  expect(first.signal, first.stderr).toBe('SIGKILL')
  return t.taskId()
}

async function resumed(t: ReturnType<typeof task>, id: string, env: Record<string, string> = {}): Promise<CrawlReport> {
  const run = await t.run({ PAID_RESUME: id, ...env })
  expect(run.code, run.stderr).toBe(0)
  return JSON.parse(run.stdout) as CrawlReport
}

const states = (rows: readonly PaidCallRecord[]) => rows.map((row) => [row.state, row.chargedUsd])
const liveSessions = (state: ProviderState) => Object.values(state.sessions).filter((session) => session.status === 'live').length

describe('paid calls through crashes, local SQLite and a simulated Steel (PA E7)', () => {
  it('a crash after the reservation, before any session: Steel has none under the call\'s name, so the reservation comes back', async () => {
    const t = task()
    const id = await crashed(t, 'after_reserve')
    expect(t.provider().creates).toEqual([])
    expect(states(await t.rows())).toEqual([['reserved', null]])
    const report = await resumed(t, id)
    // The first call is released on Steel's evidence; the page is read again, once.
    expect(states(await t.rows())).toEqual([['released', null], ['settled', 0.2]])
    expect(t.provider().creates).toHaveLength(1)
    expect(report.paidCalls).toMatchObject({ knownChargedUsd: 0.2, unknownExposureUsd: 0, reservedUsd: 0, calls: { released: 1, settled: 1 } })
  }, 30_000)

  it('a crash with the session live: the resume releases it and charges what Steel billed, then reads the page once more', async () => {
    const t = task()
    const id = await crashed(t, 'after_session')
    const [row] = await t.rows()
    expect(t.provider().sessions[paidSessionName(row!.paidCallId, 1)]).toEqual({ status: 'live', costUsd: 0.2 })
    await resumed(t, id)
    const after = await t.rows()
    expect(states(after)).toEqual([['settled', 0.2], ['settled', 0.2]])
    expect(after[0]).toMatchObject({ providerSessionId: paidSessionName(row!.paidCallId, 1) })
    // Nothing is left billing at Steel, and what the task holds is what Steel billed.
    expect(liveSessions(t.provider())).toBe(0)
    expect(t.provider().creates).toHaveLength(2)
  }, 30_000)

  it('a crash once the page is back and the session released, before its settled row: settled from Steel\'s cost', async () => {
    const t = task()
    const id = await crashed(t, 'after_page')
    expect(states(await t.rows())).toEqual([['submitted', null]])
    await resumed(t, id)
    expect(states(await t.rows())).toEqual([['settled', 0.2], ['settled', 0.2]])
    expect(liveSessions(t.provider())).toBe(0)
  }, 30_000)

  it('a crash before the page\'s step: the settled call counts on resume, and the cap holds', async () => {
    const t = task()
    // A $0.5 cap: the first call's $0.2 is settled, and the resume's $0.5 ceiling no longer fits.
    const id = await crashed(t, 'before_put_step', { PAID_BUDGET: '0.5' })
    const report = await resumed(t, id, { PAID_BUDGET: '0.5' })
    expect(states(await t.rows())).toEqual([['settled', 0.2]])
    expect(t.provider().creates).toHaveLength(1)
    expect(report.paidCalls?.knownChargedUsd).toBe(0.2)
  }, 30_000)

  it('Steel\'s billing down at the resume: the session is still released, and the call stays unknown at its ceiling, never zero', async () => {
    const t = task()
    const id = await crashed(t, 'after_session', { PAID_BUDGET: '0.9' })
    const report = await resumed(t, id, { PAID_BUDGET: '0.9', PAID_BILLING_DOWN: '1' })
    expect(states(await t.rows())).toEqual([['unknown', null]])
    expect(liveSessions(t.provider())).toBe(0)
    // $0.5 of the $0.9 is held by the unknown call: no second call.
    expect(t.provider().creates).toHaveLength(1)
    expect(report.paidCalls).toMatchObject({ knownChargedUsd: 0, unknownExposureUsd: 0.5, calls: { unknown: 1 } })
    // A later resume, with billing back, leaves the unknown call as it is: nothing releases it on its own.
    await resumed(t, id, { PAID_BUDGET: '0.9' })
    expect(states(await t.rows())).toEqual([['unknown', null]])
  }, 30_000)

  it('a charge above the reservation is charged and marked over the ceiling', async () => {
    const t = task()
    const run = await t.run({ PAID_MEASURED: '0.7', PAID_COST: '0.7', PAID_BUDGET: '2' })
    expect(run.code, run.stderr).toBe(0)
    expect(states(await t.rows())).toEqual([['settled', 0.7]])
    expect((JSON.parse(run.stdout) as CrawlReport).paidCalls).toMatchObject({ knownChargedUsd: 0.7, overCeiling: 1 })
  }, 30_000)

  it('settles each paid call once across repeated crashes and resumes, each under its own id and session name', async () => {
    const t = task()
    const id = await crashed(t, 'after_session')
    // The resume settles the first call, then crashes after reserving its own; the next resume settles that one too.
    const second = await t.run({ PAID_RESUME: id, PAID_KILL: 'after_reserve' })
    expect(second.signal, second.stderr).toBe('SIGKILL')
    const report = await resumed(t, id)
    expect(states(await t.rows())).toEqual([['settled', 0.2], ['released', null], ['settled', 0.2]])
    expect(report.paidCalls).toMatchObject({ knownChargedUsd: 0.4, calls: { settled: 2, released: 1 } })
    expect(new Set((await t.rows()).map((row) => row.paidCallId)).size).toBe(3)
    expect(t.provider().creates).toHaveLength(2)
  }, 60_000)
})

describe('a paid call\'s answer that comes after the call was cut (PA E7)', () => {
  it('is not settled again, and the row keeps the charge the cut made', async () => {
    const writes: PaidCallRecord[] = []
    let ordinal = 0
    const log: PaidCallLog = {
      open: (call) => ({ paidCallId: `t-a-${++ordinal}`, taskId: 't', attemptId: 'a', url: call.url, vendorId: call.vendorId, ceilingUsd: call.ceilingUsd, state: 'reserved', chargedUsd: null, providerRequestId: null, providerSessionId: null, tariffVersion: null, grantHash: null, deadline: null, createdAt: '2026-10-20T00:00:00.000Z', settledAt: null }),
      write: async (call) => { writes.push(call) },
    }
    const url = 'https://example.com/p'
    let answer: (result: FetchResult) => void = () => {}
    let telling: ((session: { providerSessionId: string }) => void) | undefined
    const late: Channel = {
      id: 'provider', vendorId: 'steel', priceCeilingUsd: 0.3, identity: identityBundleFrom(modeIdentity('standard')),
      fetch: (_url, _session, execution) => { telling = execution?.onPaidSession; return new Promise<FetchResult>((done) => { answer = done }) },
    }
    const ledger = createSpendLedger(1)
    const controller = new AbortController()
    const run = new LadderRunner([late], { mode: 'authed', allowlistedDomains: ['example.com'] }).run(url, undefined, { spend: ledger, paidCalls: log, signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 20))
    controller.abort(new DOMException('cancelled', 'AbortError'))
    await run.catch(() => {})
    const cut = writes.at(-1)!
    expect(cut).toMatchObject({ state: 'unknown', chargedUsd: null })
    expect(ledger.settledUsd).toBeCloseTo(0.3)
    // The provider answers, and names its session, after the cut: neither the ledger nor the row is settled a second time.
    telling?.({ providerSessionId: 'late-session' })
    answer({ requestedUrl: url } as FetchResult)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(ledger.settledUsd).toBeCloseTo(0.3)
    expect(writes.filter((row) => row.state === 'settled')).toEqual([])
    expect(writes.at(-1)?.state).toBe('unknown')
  })
})
