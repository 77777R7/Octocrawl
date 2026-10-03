import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, htmlToTables } from '../src/index.js'
import { MAX_PAGE_TABLE_CHARS, MAX_TABLE_CHARS } from '../src/markdown.js'

const gfmTables = (markdown: string): number => markdown.split('\n').filter((line) => /^\| (---( \| ---)*) \|$/.test(line)).length

describe('htmlToTables', () => {
  it('gives each data table the Markdown writes as a GFM table, in its order, as plain cells', () => {
    const html = '<main>' +
      '<table><tr><td><a href="/">Home</a></td><td><a href="/b">B</a></td></tr></table>' + // one row: a bar of links, not data
      '<table><caption>Table 1: <b>Sales</b>, 2025</caption>' +
      '<thead><tr><th>Region</th><th colspan="2">Quarter</th></tr><tr><th></th><th>Q1</th><th>Q2</th></tr></thead>' +
      '<tbody><tr><td rowspan="2">North</td><td><a href="https://x.example/q1">1,200</a></td><td>a|b "c"</td></tr>' +
      '<tr><td>1 300</td><td><img src="/i.png" alt="up"> rising</td></tr></tbody></table>' +
      '<table><tr><td>Station</td><td>Height</td></tr><tr><td>Pier<table><tr><td>inner</td></tr><tr><td>cell</td></tr></table></td><td>4.2</td></tr></table>' +
      '</main>'
    const tables = htmlToTables(html, { baseUrl: 'https://x.example/' })
    expect(tables).toHaveLength(gfmTables(htmlToMarkdown(html, { baseUrl: 'https://x.example/' })))
    expect(tables).toEqual([
      {
        tableIndex: 0, caption: 'Table 1: Sales, 2025', headerRows: 2,
        rows: [['Region', 'Quarter', 'Quarter'], ['', 'Q1', 'Q2'], ['North', '1,200', 'a|b "c"'], ['North', '1 300', 'up rising']],
      },
      { tableIndex: 1, caption: null, headerRows: 0, rows: [['Station', 'Height'], ['Pier inner cell', '4.2']] },
    ])
  })

  it('finds the data tables inside a layout table, as the Markdown does', () => {
    const story = (n: number) => `<tr><td>${n}.</td><td>Story ${n}</td></tr>`
    const html = `<table><tr><td>Header</td></tr><tr><td><table>${story(1)}${story(2)}${story(3)}</table></td></tr><tr><td>Footer</td></tr></table>`
    const tables = htmlToTables(html)
    expect(gfmTables(htmlToMarkdown(html))).toBe(1)
    expect(tables.map((table) => table.rows)).toEqual([[['1.', 'Story 1'], ['2.', 'Story 2'], ['3.', 'Story 3']]])
  })

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

  it('shares one budget among a page\'s tables, so many tables just under the cap cannot add up to a huge response', () => {
    const near = `<table><tr><td colspan="1000">${'x'.repeat(1990)}</td></tr><tr><td>y</td></tr></table>`
    const tables = htmlToTables(near.repeat(150))
    expect(tables).toHaveLength(150)
    const given = tables.filter((table) => table.omitted === undefined)
    expect(given.length).toBeGreaterThan(0)
    expect(given.length).toBeLessThanOrEqual(Math.floor(MAX_PAGE_TABLE_CHARS / (1990 * 1000)))
    expect(tables.map((table) => table.tableIndex)).toEqual(tables.map((_, i) => i))
    expect(JSON.stringify(tables).length).toBeLessThan(4 * MAX_PAGE_TABLE_CHARS)
    // Quotes count with their escaping: a cell of quotes reaches the cap sooner than its length says.
    expect(htmlToTables(`<table><tr><td colspan="1000">${'"'.repeat(1000)}</td></tr><tr><td>y</td></tr></table>`)[0]!.omitted).toBe('too_large')
    expect(htmlToTables(`<table><tr><td colspan="1000">${'\u0001'.repeat(1000)}</td></tr><tr><td>y</td></tr></table>`)[0]!.omitted).toBe('too_large')
  })

  it('counts the empty cells that pad every row to the widest in a table\'s size', () => {
    // 380 KB of HTML: one wide empty row over 20,000 one-cell rows pads to 20,001 rows of 1,000 cells (60 MB of JSON).
    const padded = `<table><tr><td colspan="1000"></td></tr>${'<tr><td>y</td></tr>'.repeat(20_000)}</table>`
    const next = '<table><tr><td>k</td><td>v</td></tr><tr><td>1</td><td>2</td></tr></table>'
    const html = padded + next
    const tables = htmlToTables(html)
    expect(tables[0]).toEqual({ tableIndex: 0, caption: null, headerRows: 0, rows: [], omitted: 'too_large' })
    expect(tables[1]).toMatchObject({ tableIndex: 1, rows: [['k', 'v'], ['1', '2']] })
    expect(tables).toHaveLength(gfmTables(htmlToMarkdown(html)))
    // The padding counts against the page's budget too: ten tables each just under the cap cannot all be given.
    const near = `<table><tr><td colspan="1000"></td></tr>${'<tr><td>y</td></tr>'.repeat(600)}</table>`
    const many = htmlToTables(near.repeat(10))
    expect(many.filter((table) => table.omitted === undefined).length).toBeLessThanOrEqual(Math.floor(MAX_PAGE_TABLE_CHARS / (3 * 1000 * 600)))
    expect(JSON.stringify(many).length).toBeLessThan(4 * MAX_PAGE_TABLE_CHARS)
  })

  it('keeps its indexes when the Markdown writes a table too large to pad unpadded', () => {
    // One wide empty row over 2,000 one-cell rows: the GFM grid would add 2 million empty cells.
    const html = `<table><tr><td colspan="1000"></td></tr>${'<tr><td>y</td></tr>'.repeat(2_000)}</table>` +
      '<table><tr><td>k</td><td>v</td></tr><tr><td>1</td><td>2</td></tr></table>'
    const markdown = htmlToMarkdown(html)
    expect(markdown.length).toBeLessThan(html.length)
    const tables = htmlToTables(html)
    expect(tables).toHaveLength(gfmTables(markdown))
    expect(tables[1]).toMatchObject({ tableIndex: 1, rows: [['k', 'v'], ['1', '2']] })
  })

  it('leaves out what the Markdown leaves out: excluded elements and empty tables', () => {
    const html = '<table class="ads"><tr><td>a</td></tr><tr><td>b</td></tr></table><table><tr></tr><tr></tr></table><table><tr><td>x</td></tr><tr><td>y</td></tr></table>'
    expect(htmlToTables(html, { exclude: ['.ads'] }).map((table) => [table.tableIndex, table.rows])).toEqual([[0, [['x'], ['y']]]])
    expect(htmlToTables('')).toEqual([])
  })
})
