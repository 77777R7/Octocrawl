import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
// The access task runner's denominator and record header (research/access/run-set.mjs), kept pure so they can be tested here.
import { CAPTCHA_CLIENT_TIMEOUT_MS, LADDER_BUDGET_MS, PROXY_REFUSED_STOP, channelsCell, clientTimeoutOf, denominator, denominatorLines, grantLine, grantOf, plannedAttempts, stopReason } from '../../../research/access/runSetReport.mjs'

const row = (taskId: string, opts: { refused?: boolean; verified?: boolean; temperature?: 'cold' | 'warm' } = {}) => ({
  taskId,
  temperature: opts.temperature ?? 'cold',
  observed: { proxyRefused: opts.refused ? { count: 1, status: 402 } : null, channelsTried: ['http'], ladderSkips: null },
  outcome: { verified: opts.verified ?? false },
})

const tasks = ['T001', 'T002', 'T003', 'T004', 'T005', 'T006'].map((id) => ({ id }))

describe('run-set denominator', () => {
  it('stops after three proxy refusals in a row and keeps the tasks not run, by id', () => {
    const planned = plannedAttempts(tasks, ['cold'])
    expect(planned).toHaveLength(6)
    const rows: ReturnType<typeof row>[] = []
    let stopped: string | null = null
    for (const p of planned) {
      rows.push(row(p.taskId, { refused: p.taskId !== 'T001' }))
      stopped = stopReason(rows, planned.length)
      if (stopped !== null) break
    }
    expect(PROXY_REFUSED_STOP).toBe(3)
    expect(stopped).toContain('last T004')
    const den = denominator(planned, rows)
    expect(den).toEqual({ planned: 6, attempted: 4, notRun: [{ taskId: 'T005', temperature: 'cold' }, { taskId: 'T006', temperature: 'cold' }] })
    const lines = denominatorLines(den, stopped).join('\n')
    expect(lines).toContain('planned 6, attempted 4, not run 2 (T005, T006)')
    expect(lines).toContain('**Stopped early:**')
    expect(lines).not.toContain('not in the denominator')
  })

  it('does not stop on a refusal that still verified, or on refusals that are not in a row', () => {
    const planned = plannedAttempts(tasks.slice(0, 5), ['cold'])
    const rows = [row('T001', { refused: true }), row('T002', { refused: true }), row('T003', { refused: true, verified: true }), row('T004', { refused: true }), row('T005', { refused: true })]
    for (let n = 1; n <= rows.length; n++) expect(stopReason(rows.slice(0, n), planned.length)).toBeNull()
    expect(denominator(planned, rows)).toEqual({ planned: 5, attempted: 5, notRun: [] })
    expect(denominatorLines(denominator(planned, rows), null).join('\n')).toContain('planned 5, attempted 5, not run 0')
  })

  it('names a warm attempt not run apart from its cold one', () => {
    const planned = plannedAttempts(tasks.slice(0, 2), ['cold', 'warm'])
    expect(planned.map((p) => `${p.taskId}-${p.temperature}`)).toEqual(['T001-cold', 'T001-warm', 'T002-cold', 'T002-warm'])
    const den = denominator(planned, [row('T001'), row('T001', { temperature: 'warm' }), row('T002')])
    expect(den.notRun).toEqual([{ taskId: 'T002', temperature: 'warm' }])
    expect(denominatorLines(den, null).join('\n')).toContain('not run 1 (T002 warm)')
  })

  it('says the tasks not run are unknown when the run did not record them', () => {
    expect(denominatorLines({ planned: null, attempted: 40, notRun: null }, 'stopped').join('\n')).toContain('planned unknown, attempted 40, not run unknown')
    expect(denominatorLines({ planned: null, attempted: 40, notRun: null }, 'stopped').join('\n')).toContain('did not record which they were')
  })
})

describe('run-set client timeout', () => {
  it("waits the task's own time by default, and past the API's ladder budget in a CAPTCHA window", () => {
    expect(clientTimeoutOf({})).toBe(180_000)
    expect(clientTimeoutOf({ timeoutMs: 60_000 })).toBe(60_000)
    // A CAPTCHA page can use the API's whole 300 s ladder (C011 was cut at 180 s with no response saved).
    expect(clientTimeoutOf({ timeoutMs: 60_000 }, CAPTCHA_CLIENT_TIMEOUT_MS)).toBe(CAPTCHA_CLIENT_TIMEOUT_MS)
    expect(CAPTCHA_CLIENT_TIMEOUT_MS).toBeGreaterThanOrEqual(LADDER_BUDGET_MS + 30_000)
  })
})

describe('run-set grant line', () => {
  it("gives the grant file's SHA-256 and its capability names, nothing else of it", () => {
    const text = JSON.stringify({ tier: 'enhanced', capabilities: ['vendor_remote_browser', 'vendor_stealth'], budget: { perRunUsd: 5 }, attestation: { principal: 'someone@example.com', at: '2026-10-05T12:00:00Z', statement: 'ok' } })
    const grant = grantOf(text)
    expect(grant).toEqual({ sha256: createHash('sha256').update(text).digest('hex'), capabilities: ['vendor_remote_browser', 'vendor_stealth'] })
    const line = grantLine(grant)
    expect(line).toMatch(/^- Grant: SHA-256 `[0-9a-f]{64}`; capabilities: vendor_remote_browser, vendor_stealth/)
    expect(line).not.toContain('someone@example.com')
    expect(line).not.toContain('perRunUsd')
  })

  it('says none when no grant was given, and not recorded for a run from before the line', () => {
    expect(grantOf(undefined)).toBeNull()
    expect(grantLine(null)).toMatch(/^- Grant: none/)
    expect(grantLine(undefined)).toMatch(/^- Grant: not recorded/)
  })

  it('says a grant that is not JSON has unreadable capabilities, with its hash', () => {
    expect(grantLine(grantOf('not json'))).toMatch(/^- Grant: SHA-256 `[0-9a-f]{64}`; capabilities: unreadable/)
  })
})

describe('run-set channels tried', () => {
  it('names the rungs tried and the ones the ladder passed over, and unknown when the answer said nothing', () => {
    const skipped = { ...row('T076'), observed: { proxyRefused: null, channelsTried: ['http', 'browser_local'], ladderSkips: [{ channel: 'provider', vendorId: 'steel', rule: 'robots_override', reason: 'x' }] } }
    expect(channelsCell(skipped)).toBe('http → browser_local; passed over: provider (steel, robots_override)')
    expect(channelsCell({ ...row('T001'), observed: { proxyRefused: null, channelsTried: null, ladderSkips: null } })).toBe('unknown')
  })
})
