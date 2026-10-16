import { describe, expect, it } from 'vitest'
import { parseHTML } from 'linkedom'
import { materializeShadowTables, type CapturedShadowTable } from '../src/shadowTables.js'

const html = '<html><body><main><quote-table><template shadowrootmode="open"><div role="table"><div role="row" part="table-header-row"><div role="cell">Date</div><div role="cell">Value</div></div><div role="row"><div role="cell">2026-10-14</div><div role="cell">0</div></div></div></template></quote-table></main></body></html>'
const capture: CapturedShadowTable = { hostPath: [0, 0], hostTag: 'quote-table', rows: [['Date', 'Value'], ['2026-10-14', '0']] }

describe('materializeShadowTables', () => {
  it('creates cells at the captured host, preserving literal text and zero', () => {
    const result = materializeShadowTables(html.replace('>0</div>', '>&lt;literal&gt; &amp; 0</div>'), [{ ...capture, rows: [['Date', 'Value'], ['2026-10-14', '<literal> & 0']] }])!
    const table = parseHTML(result).document.querySelector('main > quote-table > table')!
    expect(Array.from(table.querySelectorAll('td'), cell => cell.textContent)).toEqual(['2026-10-14', '<literal> & 0'])
    expect(table.querySelector('literal')).toBeNull()
  })

  it('rejects mismatched paths or roots without returning a partially changed document', () => {
    expect(materializeShadowTables(html, [{ ...capture, hostPath: [3] }])).toBeNull()
    expect(materializeShadowTables(html, [{ ...capture, hostTag: 'other-table' }])).toBeNull()
    expect(materializeShadowTables(html.replace('"open"', '"closed"'), [capture])).toBeNull()
    expect(materializeShadowTables(html, [capture, capture])).toBeNull()
    expect(materializeShadowTables(html, [{ ...capture, rows: [['Date', 'Value'], ['2026-10-14', '999']] }])).toBeNull()
  })

  it('rejects oversized or irregular capture descriptions before parsing', () => {
    expect(materializeShadowTables(html, [{ ...capture, hostPath: [-1] }])).toBeNull()
    expect(materializeShadowTables(html, [{ ...capture, hostPath: Array(129).fill(0) }])).toBeNull()
    expect(materializeShadowTables(html, [{ ...capture, rows: [['A', 'B'], ['only one']] }])).toBeNull()
    expect(materializeShadowTables(html, [{ ...capture, rows: Array.from({ length: 2_002 }, () => ['A', 'B']) }])).toBeNull()
    expect(materializeShadowTables('x'.repeat(1_000_001), [capture])).toBeNull()
  })
})
