import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// The CAPTCHA and DataDome measurement's per-arm, per-type cells (research/access/captchaReport.mjs).
import { armCells, baseArmOf, cellsTable, manifestText, solverOf } from '../../../research/access/captchaReport.mjs'
import { isData } from '../../../research/access/judge.mjs'

const doc = (paidCalls: unknown[] | undefined) => ({ evidenceRecord: { access: paidCalls === undefined ? {} : { paidCalls } } })
const tasks = [
  { id: 'T045', challenge: { primaryType: 'datadome' } },
  { id: 'T046', challenge: { primaryType: 'datadome' } },
  { id: 'C001', challenge: { primaryType: 'turnstile' } },
]
const row = (taskId: string, opts: { verified?: boolean; falseSuccess?: boolean; wallMs?: number; solver?: ReturnType<typeof solverOf> } = {}) => ({
  taskId, temperature: 'cold',
  observed: { solver: opts.solver === undefined ? { calls: 0, attempted: 0, succeeded: 0, reportedUsd: 0, chargedUsd: 0, solveMs: 0 } : opts.solver },
  outcome: { verified: opts.verified ?? false, falseSuccess: opts.falseSuccess ?? false, wallMs: opts.wallMs ?? 1000, chargedUsd: 0 },
})

describe('captcha report', () => {
  it('reads the solver calls by provider, and keeps an unreported figure unknown', () => {
    const s = solverOf(doc([{ provider: 'steel', chargedUsd: 0.01 }, { provider: 'capsolver', solves: 1, reportedCostUsd: 0.0012, chargedUsd: 0.002, solveMs: 9000 }, { provider: 'capsolver', solves: null, chargedUsd: 0.002 }]))
    expect(s).toEqual({ calls: 2, attempted: 2, succeeded: null, reportedUsd: null, chargedUsd: 0.004, solveMs: null })
    expect(solverOf(doc([{ provider: 'steel' }]))).toEqual({ calls: 0, attempted: 0, succeeded: 0, reportedUsd: 0, chargedUsd: 0, solveMs: 0 })
    // A record whose paidCalls is null (no grant) made none; one that says nothing of paid calls is unknown, not none.
    expect(solverOf({ evidenceRecord: { access: { paidCalls: null } } })).toMatchObject({ calls: 0, attempted: 0, succeeded: 0 })
    expect(solverOf(doc(undefined))).toBeNull()
    expect(solverOf({})).toBeNull()
  })

  it('counts by type, keeps tasks not run in the denominator and pairs the time a solve added with the base arm', () => {
    const solved = { calls: 1, attempted: 1, succeeded: 1, reportedUsd: 0.003, chargedUsd: 0.003, solveMs: 8000 }
    const cells = armCells(tasks, [row('T045', { verified: true, wallMs: 21000, solver: solved }), row('C001', { falseSuccess: true })], [row('T045', { wallMs: 6000 }), row('C001')])
    expect(cells.all).toMatchObject({ planned: 3, attempted: 2, notRun: ['T046'], verified: 1, falseSuccess: 1, solvesAttempted: 1, solvesSucceeded: 1, usdPerSolve: 0.003, solveMs: 8000, pairedAddedMs: { n: 1, median: 15000 } })
    expect(cells.byType.datadome).toMatchObject({ planned: 2, attempted: 1, notRun: ['T046'], verified: 1 })
    expect(cells.byType.turnstile).toMatchObject({ planned: 1, falseSuccess: 1, solvesAttempted: 0, usdPerSolve: null })
  })

  it('reports an attempt without a paid-call record as unknown solves, and an arm never started as all not run', () => {
    const cells = armCells(tasks, [row('T045', { solver: null })])
    expect(cells.byType.datadome).toMatchObject({ solvesAttempted: null, solvesSucceeded: null, usdPerSolve: null, solveMs: null })
    const never = armCells(tasks, null)
    expect(never.all).toMatchObject({ planned: 3, attempted: 0, notRun: ['T045', 'T046', 'C001'], verified: 0 })
    const table = cellsTable([{ arm: 'standard+solver', cells: never }]).join('\n')
    expect(table).toContain('| standard+solver | **all** | 3 | 0 | 3 | 0 | 0 |')
    expect(table).toContain('| 0 | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a |')
    expect(baseArmOf('combined+solver')).toBe('combined')
    expect(baseArmOf('combined')).toBeNull()
  })
})

describe('captcha-tasks.v1.json', () => {
  const read = (f: string) => JSON.parse(readFileSync(new URL(`../../../research/access/${f}`, import.meta.url), 'utf8'))
  const file = read('captcha-tasks.v1.json')
  const source = new Map(read('tasks.v1.json').tasks.map((t: { id: string }) => [t.id, t]))

  it('still hashes to its frozen manifest, so no task was dropped or replaced', () => {
    expect(createHash('sha256').update(manifestText(file)).digest('hex')).toBe(file.manifestSha256)
  })

  it('gives every task a data predicate and a challenge type, and copies saved-run tasks unchanged', () => {
    expect(new Set(file.tasks.map((t: { id: string }) => t.id)).size).toBe(file.tasks.length)
    for (const t of file.tasks) {
      expect(t.part).toBe('frozen')
      expect(t.predicates.some(isData)).toBe(true)
      expect(typeof t.challenge.primaryType).toBe('string')
      if (t.origin === 'saved_run') {
        const s = source.get(t.id) as { url: string; request: unknown; predicates: unknown }
        expect({ url: t.url, request: t.request, predicates: t.predicates }).toEqual({ url: s.url, request: s.request, predicates: s.predicates })
      } else expect(['real', 'vendor_demo']).toContain(t.origin)
    }
  })
})
