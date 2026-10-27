import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { hostedNetworkPolicy, type VerifyCheck } from '@w2l/contracts'
import { createHostedApi, hostedTools, keyDigest, MemoryHostedKeys, MemoryHostedQuota } from '../src/hostedApi.js'
import { MemoryCreditsStore, scrapeCharge } from '../src/hostedCredits.js'
import { TOOLS } from '../src/tools.js'
// The hosted parity window's pure parts (research/hosted/parity-window.mjs), kept apart so they can be tested here.
import { armOrder, armSummary, contractFor, documentOf, listedCheckTypes, powerState, robotsLine, robotsOf, robotsRefusedTasks, robotsUnknownTasks, runWindow, summaryTable, verdictOf, type CallAnswer, type Task } from '../../../research/hosted/parityWindow.mjs'

const taskFile = JSON.parse(await readFile(new URL('../../../research/access/tasks.v1.json', import.meta.url), 'utf8')) as { tasks: Task[] }
const PAGE = `<!doctype html><html lang="en"><head><title>Tides</title></head><body><main><article><h1>Tides</h1><p>${'The harbour office records tide height every hour of the day. '.repeat(8)}</p></article></main></body></html>`

describe('what each endpoint is asked', () => {
  it('sends a task the checks the endpoint lists: hosted none of the regular-expression ones, a local server all of them', () => {
    const hosted = listedCheckTypes(hostedTools(true))
    const local = listedCheckTypes(TOOLS)
    expect(hosted).not.toContain('markdownMatches')
    expect(hosted).not.toContain('markdownCountMin')
    expect(hosted).toContain('minTables')
    expect(local).toEqual(expect.arrayContaining(['markdownMatches', 'markdownCountMin', 'minTables']))
    // Every weekly task carries a regular-expression check, so hosted gets fewer checks, or none.
    const withTables = taskFile.tasks.find((task) => task.predicates.some((p) => p.type === 'minTables'))!
    expect(contractFor(withTables.predicates, hosted)).toEqual({ checks: withTables.predicates.filter((p) => p.type === 'minTables') })
    const regexOnly = taskFile.tasks.find((task) => task.predicates.every((p) => p.type === 'markdownMatches' || p.type === 'markdownCountMin'))!
    expect(contractFor(regexOnly.predicates, hosted)).toBeUndefined()
    expect(contractFor(regexOnly.predicates, local)).toEqual({ checks: regexOnly.predicates })
    expect(listedCheckTypes(undefined)).toEqual([])
  })

  it('calls the arms in each of their orders in turn, so each comes first, and before each other arm, as often as the others', () => {
    const arms = ['hosted', 'local', 'local_grant']
    const six = Array.from({ length: 6 }, (_, i) => armOrder(arms, i))
    expect(new Set(six.map((order) => order.join(','))).size).toBe(6)
    expect(armOrder(arms, 6)).toEqual(six[0])
    for (const arm of arms) expect(six.filter((order) => order[0] === arm)).toHaveLength(2)
    const before = (a: string, b: string) => six.filter((order) => order.indexOf(a) < order.indexOf(b)).length
    expect([before('local', 'local_grant'), before('local_grant', 'local'), before('hosted', 'local')]).toEqual([3, 3, 3])
    expect(armOrder(['hosted'], 5)).toEqual(['hosted'])
  })

  it('runs only on AC power with the lid open', () => {
    expect(powerState("Now drawing from 'AC Power'\n", '"AppleClamshellState" = No')).toEqual({ ac: true, lidOpen: true })
    expect(powerState("Now drawing from 'Battery Power'\n", '"AppleClamshellState" = No')).toEqual({ ac: false, lidOpen: true })
    expect(powerState("Now drawing from 'AC Power'\n", '"AppleClamshellState" = Yes')).toEqual({ ac: true, lidOpen: false })
    expect(powerState("Now drawing from 'AC Power'\n", '')).toEqual({ ac: true, lidOpen: null })
  })
})

describe('how an answer is read and judged', () => {
  const task: Task = { id: 'X1', url: 'https://example.com/', predicates: [{ type: 'markdownMatches', pattern: 'Tides' }, { type: 'markdownCountMin', pattern: 'hour', min: 2 }] as VerifyCheck[] }

  it('reads a tool error by its code, else the result, and says when it cannot', () => {
    expect(documentOf({ isError: true, content: [{ type: 'text', text: 'unsupported_parameter: verify: markdownMatches checks are not available\nNext: x' }], _meta: { 'octocrawl/error': { code: 'unsupported_parameter', status: 400 } } }))
      .toEqual({ doc: null, toolError: { code: 'unsupported_parameter', message: 'unsupported_parameter: verify: markdownMatches checks are not available' } })
    expect(documentOf({ isError: true, content: [{ type: 'text', text: 'rate_limited: too many' }] }).toolError?.code).toBe('rate_limited')
    expect(documentOf({ content: [{ type: 'text', text: '{"status":"success","markdown":"# Tides"}' }] })).toEqual({ doc: { status: 'success', markdown: '# Tides' }, toolError: null })
    expect(documentOf({ content: [], structuredContent: { status: 'failed' } }).doc).toEqual({ status: 'failed' })
    expect(documentOf({ content: [{ type: 'text', text: 'not json' }] }).toolError?.code).toBe('unreadable_result')
  })

  it('judges every predicate on what the agent received, and calls a success whose data is missing a false success', () => {
    expect(verdictOf(task, { status: 'success', markdown: 'Tides every hour, each hour' })).toEqual({ verified: true, falseSuccess: false, failedPredicates: [] })
    expect(verdictOf(task, { status: 'success', markdown: 'Tides once an hour' })).toEqual({ verified: false, falseSuccess: true, failedPredicates: ['markdownCountMin'] })
    expect(verdictOf(task, { status: 'blocked', markdown: null })).toMatchObject({ verified: false, falseSuccess: false })
    expect(verdictOf(task, null)).toEqual({ verified: false, falseSuccess: false, failedPredicates: [] })
  })

  it('tells a robots.txt refusal from a disallow a local server set aside', () => {
    expect(robotsOf({ status: 'failed', failureReason: 'policy_denied', evidenceRecord: { robotsDecision: { decision: 'disallowed' } } })).toBe('refused')
    expect(robotsOf({ status: 'success', evidenceRecord: { robotsDecision: { decision: 'disallowed', userOverride: true, overrideBasis: 'user_named_url' } } })).toBe('overridden')
    expect(robotsOf({ status: 'success', evidenceRecord: { robotsDecision: { decision: 'allowed' } } })).toBeNull()
    expect(robotsOf(null)).toBeNull()
  })
})

describe('a window', () => {
  const tasks: Task[] = [
    { id: 'A', url: 'https://example.com/a', predicates: [{ type: 'markdownMatches', pattern: 'Tides' }] as VerifyCheck[] },
    { id: 'B', url: 'https://example.com/b', predicates: [{ type: 'markdownMatches', pattern: 'Tides' }] as VerifyCheck[] },
  ]
  const answer = (doc: unknown, wallMs: number): CallAnswer => ({ result: { content: [{ type: 'text', text: JSON.stringify(doc) }] }, wallMs })

  it('keeps every planned attempt in the denominator, an arm held back by its credit cap as not run', async () => {
    const order: string[] = []
    const rows = await runWindow({
      tasks, arms: ['hosted', 'local'],
      call: async (arm, task) => { order.push(`${task.id}:${arm}`); return arm === 'hosted' ? answer({ status: 'success', lane: 'browser_local', markdown: 'Tides' }, 101_000) : answer({ status: 'blocked', blockReason: 'captcha', markdown: null }, 2_000) },
      canRun: (arm, sofar) => (arm === 'hosted' && sofar.some((r) => r.arm === 'hosted') ? 'credit cap 5' : null),
      charge: (arm, doc) => (arm === 'hosted' ? scrapeCharge(doc as Parameters<typeof scrapeCharge>[0]).credits : null),
    })
    expect(order).toEqual(['A:hosted', 'A:local', 'B:local'])
    const hosted = armSummary(rows, 'hosted')
    expect(hosted).toMatchObject({ planned: 2, attempted: 1, notRun: 1, verified: 1, falseSuccess: 0, credits: 5, overCap: 1, p50Ms: 101_000 })
    expect(armSummary(rows, 'local')).toMatchObject({ planned: 2, attempted: 2, verified: 0, reasons: { captcha: 2 }, credits: null })
    expect(summaryTable([hosted]).at(-1)).toContain('| hosted | 1 / 2 | 1 / 2 | 0 | 0 | 1 |')
  })

  it('counts every arm over all tasks and over the tasks robots.txt allows, keeping the ones hosted refused in the denominator and listing them', async () => {
    const three: Task[] = [...tasks, { id: 'C', url: 'https://example.com/c', predicates: [{ type: 'markdownMatches', pattern: 'Tides' }] as VerifyCheck[] }]
    const disallowed = { decision: 'disallowed' }
    const rows = await runWindow({
      tasks: three, arms: ['hosted', 'local'],
      call: async (arm, task) => {
        if (task.id === 'B') return arm === 'hosted'
          ? answer({ status: 'failed', failureReason: 'policy_denied', markdown: null, evidenceRecord: { robotsDecision: disallowed } }, 300)
          : answer({ status: 'success', markdown: 'Tides', evidenceRecord: { robotsDecision: { ...disallowed, userOverride: true, overrideBasis: 'user_named_url' } } }, 900)
        if (task.id === 'C' && arm === 'hosted') return answer({ status: 'success', markdown: 'nothing here' }, 800)
        return answer({ status: 'success', markdown: 'Tides' }, 500)
      },
    })
    expect(robotsRefusedTasks(rows)).toEqual(['B'])
    const hosted = armSummary(rows, 'hosted')
    const local = armSummary(rows, 'local')
    // B stays in the denominator of the whole set, and is left out of the count over what robots.txt allows, on every arm.
    expect(hosted).toMatchObject({ planned: 3, verified: 1, falseSuccess: 1, robotsAllowed: { planned: 2, verified: 1, falseSuccess: 1 } })
    expect(local).toMatchObject({ planned: 3, verified: 3, robotsAllowed: { planned: 2, verified: 2, falseSuccess: 0 } })
    const table = summaryTable([hosted, local])
    expect(table[0]).toContain('| Arm | Verified | Verified, robots.txt allows | False successes | False successes, robots.txt allows |')
    expect(table.slice(2)).toEqual([expect.stringContaining('| hosted | 1 / 3 | 1 / 2 | 1 | 1 |'), expect.stringContaining('| local | 3 / 3 | 2 / 2 | 0 | 0 |')])
    expect(robotsLine(rows, ['hosted', 'local'])).toContain('hosted refused 1 task for robots.txt: B.')
    expect(robotsLine(rows.filter((r) => r.taskId !== 'B'), ['hosted', 'local'])).toContain('hosted refused no task it answered for robots.txt')

    // Without a hosted arm nobody knows which tasks hosted would refuse: the robots.txt view is unknown, not the whole set.
    const localOnly = rows.filter((r) => r.arm === 'local')
    expect(robotsRefusedTasks(localOnly)).toBeNull()
    expect(armSummary(localOnly, 'local').robotsAllowed).toBeNull()
    expect(summaryTable([armSummary(localOnly, 'local')]).at(-1)).toContain('| local | 3 / 3 | unknown | 0 | unknown |')
    expect(robotsLine(localOnly, ['local'])).toContain('unknown')
  })

  it('calls whether robots.txt allows a task unknown where hosted gave no answer: held back by the cap, or a call that failed', async () => {
    const robotsDenied = answer({ status: 'failed', failureReason: 'policy_denied', markdown: null, evidenceRecord: { robotsDecision: { decision: 'disallowed' } } }, 300)
    const ok = answer({ status: 'success', markdown: 'Tides' }, 500)
    const run = (canRun: (arm: string, sofar: readonly { arm: string }[]) => string | null, failB = false) => runWindow({
      tasks, arms: ['hosted', 'local'], canRun,
      call: async (arm, task) => (arm === 'hosted' && task.id === 'B' ? (failB ? { error: new Error('socket hang up'), wallMs: 160_000 } : robotsDenied) : ok),
    })
    // A cap that holds every hosted call back: hosted answered nothing, so the view is unknown, not "refused none".
    const none = await run((arm) => (arm === 'hosted' ? 'credit cap 0' : null))
    expect(robotsRefusedTasks(none)).toBeNull()
    expect(armSummary(none, 'local').robotsAllowed).toBeNull()
    expect(robotsLine(none, ['hosted', 'local'])).not.toContain('refused no task')
    // A held back after A: A is known, B is unknown and named; it stays in the denominator, not verified on hosted.
    const some = await run((arm, sofar) => (arm === 'hosted' && sofar.some((r) => r.arm === 'hosted') ? 'credit cap 5' : null))
    expect([robotsRefusedTasks(some), robotsUnknownTasks(some)]).toEqual([[], ['B']])
    expect(armSummary(some, 'hosted').robotsAllowed).toEqual({ planned: 2, verified: 1, falseSuccess: 0 })
    expect(robotsLine(some, ['hosted', 'local'])).toContain('unknown for 1 task: B')
    const failed = await run(() => null, true)
    expect(robotsUnknownTasks(failed)).toEqual(['B'])
    expect(robotsUnknownTasks(none.filter((r) => r.arm === 'local'))).toBeNull()
  })

  it('counts the credits of an answer it could not read, or a call that failed on the way, as unknown', async () => {
    const rows = await runWindow({
      tasks: tasks.slice(0, 1), arms: ['hosted'],
      call: async () => ({ error: new Error('socket hang up'), wallMs: 160_000 }),
      charge: () => 1,
    })
    expect(rows[0]).toMatchObject({ toolError: { code: 'call_failed' }, credits: null, verified: false })
    expect(armSummary(rows, 'hosted').credits).toBeNull()
  })
})

describe('a window against a hosted MCP endpoint', () => {
  const HASH_KEY = 'h'.repeat(40)
  let site: Server
  let origin: string
  let root: string
  let close: () => Promise<void>
  let mcpUrl: string
  beforeAll(async () => {
    site = createServer((req, res) => {
      if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /private\n')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
    })
    site.listen(0, '127.0.0.1'); await once(site, 'listening')
    origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
    root = await mkdtemp(join(tmpdir(), 'octocrawl-parity-window-'))
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
    const port = (probe.address() as AddressInfo).port
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    const service = createHostedApi({
      port, host: '127.0.0.1', taskRoot: root, hashKey: HASH_KEY, quota: new MemoryHostedQuota(), credits: new MemoryCreditsStore(), log: () => {},
      keys: new MemoryHostedKeys(new Map([[keyDigest(HASH_KEY, 'oc_window'), { enabled: true, plan: 'account', dailyLimit: 0, browser: true, uid: 'account-1' }]])),
      networkPolicy: { ...hostedNetworkPolicy(), privateAllowlist: ['127.0.0.0/8'] },
    })
    close = service.close
    if (!service.server.listening) await once(service.server, 'listening')
    mcpUrl = `http://127.0.0.1:${port}/mcp`
  })
  afterAll(async () => {
    await close?.()
    await new Promise<void>((resolve) => site.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  })

  it('asks hosted as an agent would, and reads its credits, robots.txt refusals and verdicts from the answers', async () => {
    const client = new Client({ name: 'parity-window-test', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl), { requestInit: { headers: { authorization: 'Bearer oc_window' } } }))
    try {
      const listed = listedCheckTypes((await client.listTools()).tools)
      const window: Task[] = [
        { id: 'OK', url: `${origin}/tides`, request: { formats: ['markdown'] }, predicates: [{ type: 'markdownMatches', pattern: 'Tides' }, { type: 'minTables', min: 0 }] as VerifyCheck[] },
        { id: 'ROBOTS', url: `${origin}/private`, request: { formats: ['markdown'] }, predicates: [{ type: 'markdownMatches', pattern: 'Tides' }] as VerifyCheck[] },
      ]
      const sentArgs: unknown[] = []
      const rows = await runWindow({
        tasks: window, arms: ['hosted'],
        call: async (_arm, task) => {
          const contract = contractFor(task.predicates, listed)
          const args = { url: task.url, ...(task.request ?? {}), ...(contract === undefined ? {} : { verify: contract }) }
          sentArgs.push(args)
          const started = Date.now()
          try { return { result: await client.callTool({ name: 'scrape', arguments: args }), wallMs: Date.now() - started } } catch (error) { return { error, wallMs: Date.now() - started } }
        },
        charge: (_arm, doc) => scrapeCharge(doc as Parameters<typeof scrapeCharge>[0]).credits,
      })
      // The regular-expression check stays home; the one hosted lists goes.
      expect(sentArgs[0]).toEqual({ url: `${origin}/tides`, formats: ['markdown'], verify: { checks: [{ type: 'minTables', min: 0 }] } })
      expect(rows[0]).toMatchObject({ taskId: 'OK', status: 'success', lane: 'http', verified: true, credits: 1, toolError: null, robots: null })
      expect(rows[1]).toMatchObject({ taskId: 'ROBOTS', status: 'failed', robots: 'refused', verified: false, credits: 0 })
      expect(armSummary(rows, 'hosted')).toMatchObject({ verified: 1, credits: 1, robotsRefused: ['ROBOTS'] })
    } finally { await client.close() }
  })
})
