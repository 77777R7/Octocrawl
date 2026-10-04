import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, htmlToTables } from '../src/index.js'
import { MAX_TABLE_CHARS } from '../src/markdown.js'

describe('htmlToTables', () => {
  it('caps spans as browsers do and omits a table too large to give, keeping the index of the next', () => {
    // 4 KB of HTML whose span, repeated, would be 4 * 10^9 characters (3 * 10^6 once capped at 1000 columns): omitted.
    const hostile = `<table><tr><td colspan="1000000">${'x'.repeat(3000)}</td></tr><tr><td>y</td></tr></table>`
    const capped = '<table><tr><td colspan="5000">wide</td></tr><tr><td>a</td></tr></table>'
    const next = '<table><tr><td>k</td><td>v</td></tr><tr><td>1</td><td>2</td></tr></table>'
    const started = Date.now()
    const tables = htmlToTables(hostile + capped + next)
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(3001 * 1000).toBeGreaterThan(MAX_TABLE_CHARS)
    expect(tables[0]).toEqual({ tableIndex: 0, caption: null, headerRows: 0, rows: [], omitted: 'too_large' })
    expect(tables[1]!.rows[0]).toHaveLength(1000)
    expect(tables[1]!.rows[0]!.every((cell) => cell === 'wide')).toBe(true)
    expect(tables[2]).toMatchObject({ tableIndex: 2, rows: [['k', 'v'], ['1', '2']] })
  })

  it('finds each row\'s group without walking past its table, however deep the table is', () => {
    // ~900 KB: 30,000 rows in a <div> in a table 4,000 elements deep.
    const html = `${'<div>'.repeat(4000)}<table><div>${'<tr><td>a</td><td>b</td></tr>'.repeat(30_000)}</div></table>${'</div>'.repeat(4000)}`
    const started = Date.now()
    expect(htmlToTables(html, { onlyMainContent: false })[0]!.rows).toHaveLength(30_000)
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('tells layout tables from data tables in time linear in the page, however deep its tables are nested', () => {
    // Two-row tables, each nested in the last row of the one around it: each is asked whether it lays out the others.
    const chain = (n: number) => `${'<table><tr><td>a</td></tr><tr><td>'.repeat(n)}x${'</td></tr></table>'.repeat(n)}`
    const run = (html: string): number => {
      const started = performance.now()
      htmlToMarkdown(html)
      htmlToTables(html)
      return performance.now() - started
    }
    expect(htmlToTables(chain(3)).map((table) => table.rows)).toEqual([[['a'], ['x']]])
    run(chain(100))
    // The two sizes take turns, so a busy moment of the machine slows both.
    let smallBest = Infinity
    let largeBest = Infinity
    for (let i = 0; i < 3; i++) {
      smallBest = Math.min(smallBest, run(chain(1_000)))
      largeBest = Math.min(largeBest, run(chain(2_000)))
    }
    // Twice the depth takes about twice the time; it took four times as long when each table measured all it holds.
    expect(largeBest / smallBest).toBeLessThan(3)
  })
})
