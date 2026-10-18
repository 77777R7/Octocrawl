import { expect, it } from 'vitest'
import { materializeShadowTables } from '../src/shadowTables.js'

it('materializes one bounded capture with a thousand data rows', () => {
  const rows = [['Date', 'Value'], ...Array.from({ length: 1_000 }, (_, index) => [`2026-${index}`, String(index)])]
  const content = rows.map((row, index) => `<div role="row"${index === 0 ? ' part="table-header-row"' : ''}>${row.map(value => `<div role="cell">${value}</div>`).join('')}</div>`).join('')
  const html = `<html><body><quote-table><template shadowrootmode="open"><div role="table">${content}</div></template></quote-table></body></html>`
  const started = performance.now()
  const result = materializeShadowTables(html, [{ hostPath: [0], hostTag: 'quote-table', rows }])
  expect(result).toContain('<td>2026-999</td><td>999</td>')
  expect(performance.now() - started).toBeLessThan(1_000)
})
