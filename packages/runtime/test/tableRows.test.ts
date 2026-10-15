import { describe, expect, it } from 'vitest'
import type { VerifyContract } from '@w2l/contracts'
import { verify } from '../src/verify.js'

// The selected table and columns are caller requirements, never inferred from the site's name.
const contract = { checks: [{ type: 'tableRowsMin', tableIndex: 1, columns: [0, 1], min: 2 }] } satisfies VerifyContract
const table = (rows: string[][], headerRows = 1) => ({ tableIndex: 1, rows, headerRows })

describe('task-required cells in delivered table rows', () => {
  it('counts only same-row required cells after all header rows, keeping zero values', () => {
    const selected = table([['Date', 'Value'], ['2026-01', '0'], ['2026-02', '2.5'], ['2026-03', ' ']])
    expect(verify(contract, { status: 'success', tables: [{ ...table([['Wrong', 'Table']], 0), tableIndex: 0 }, selected] })).toMatchObject({
      status: 'passed', checks: [{ passed: true, observedCount: 2, asked: 2 }],
    })
    expect(verify(contract, { status: 'success', tables: [table([['Group', 'Values'], ['Date', 'Value'], ['2026-01', '0']], 2)] })).toMatchObject({
      status: 'failed', checks: [{ passed: false, observedCount: 1 }],
    })
  })

  it('rejects skeletons, placeholder cells, missing columns and values scattered across rows', () => {
    for (const rows of [
      [['Date', 'Value'], ['', ''], ['\u00a0', '\u200b']],
      [['Date', 'Value'], ['2026-01', '—'], ['2026-02', '...']],
      [['Date', 'Value'], ['2026-01'], ['2026-02']],
      [['Date', 'Value'], ['2026-01', ''], ['', '2.5']],
    ]) expect(verify(contract, { status: 'success', tables: [table(rows)] })).toMatchObject({
      status: 'failed', checks: [{ passed: false, observedCount: 0, asked: 2 }],
    })
  })

  it('requires the named table, skips oversized omissions and does not substitute another table', () => {
    for (const tables of [undefined, [], [{ ...table([['Date', 'Value'], ['2026-01', '2']]), tableIndex: 0 }], [{ ...table([]), omitted: 'too_large' }]]) {
      expect(verify(contract, { status: 'success', tables })).toMatchObject({ status: 'failed', checks: [{ passed: false, observedCount: 0 }] })
    }
    // The DOM's table count is not a reading of the selected table's cells.
    expect(verify(contract, { status: 'success', tableCount: 2 }, { partial: true })).toMatchObject({ checks: [{ passed: null }] })
  })

  it('leaves the frozen minTables predicate unchanged even for a blank GFM table', () => {
    expect(verify({ checks: [{ type: 'minTables', min: 1 }] }, { status: 'success', markdown: '| Date | Value |\n| --- | --- |\n| | |' })).toMatchObject({ status: 'passed' })
  })
})
