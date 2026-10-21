import { describe, expect, it } from 'vitest'
import type { ExtractorOptions } from '@w2l/contracts'
import { extractTf, htmlToMarkdown, htmlToTables } from '../src/index.js'

/**
 * Standings shaped like a sports site's (D6, split standings): each group is
 * one table drawn as two side by side, a fixed one-column table of team names
 * and a scrolling table of their statistics, whose rows carry the same
 * data-idx. Synthetic: no retained page.
 */
const TEAMS = [
  { name: 'Harbour Owls', href: '/team/owls', stats: ['5', '1', '.833', '-'] },
  { name: 'Lakeside Herons', href: '/team/herons', stats: ['4', '2', '.667', '1'] },
  { name: 'Ridge Foxes', href: '/team/foxes', stats: ['2', '4', '.333', '3'] },
]
const HEAD = ['W', 'L', 'PCT', 'GB']

interface Options { order?: number[]; keys?: boolean; nameKeys?: (i: number) => string; between?: string; nameCols?: (t: typeof TEAMS[number], i: number) => string; valueCols?: (t: typeof TEAMS[number]) => string; valueHead?: string; nameHead?: string; rows?: number /** name rows only */ }
function group(title: string, o: Options = {}): string {
  const keys = o.keys ?? true
  const teams = TEAMS.slice(0, o.rows ?? TEAMS.length)
  const nameRow = (t: typeof TEAMS[number], i: number) => `<tr${keys ? ` data-idx="${o.nameKeys ? o.nameKeys(i) : i}"` : ''}>${o.nameCols ? o.nameCols(t, i) : `<td><a href="${t.href}">${t.name}</a></td>`}</tr>`
  const valueRow = (i: number) => `<tr${keys ? ` data-idx="${i}"` : ''}>${o.valueCols ? o.valueCols(TEAMS[i]!) : TEAMS[i]!.stats.map((s) => `<td>${s}</td>`).join('')}</tr>`
  return `<div class="standings"><div class="title">${title}</div><div class="flex">` +
    `<table class="fixed-left"><thead><tr>${o.nameHead ?? '<th></th>'}</tr></thead><tbody>${teams.map(nameRow).join('')}</tbody></table>` +
    (o.between ?? '') +
    `<div class="scroller"><div class="shadow"></div><div class="inner"><table><thead><tr>${o.valueHead ?? HEAD.map((h) => `<th>${h}</th>`).join('')}</tr></thead>` +
    `<tbody>${(o.order ?? TEAMS.map((_, i) => i)).map(valueRow).join('')}</tbody></table></div></div></div></div>`
}
const page = (body: string) => `<!doctype html><html><head><title>League standings</title></head><body><main><h1>League Standings 2026-27</h1>${body}</main></body></html>`
const URL = 'https://sport.fixture.test/league/standings'
function extract(html: string, options: ExtractorOptions = {}) {
  const out = extractTf.extract(html, { url: URL, ...options })
  return { md: htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl }), tables: htmlToTables(out.mainHtml, { baseUrl: out.baseUrl }) }
}
const joinedRows = (order = [0, 1, 2]) => order.map((i) => [TEAMS[i]!.name, ...TEAMS[i]!.stats])

describe('a table split into a fixed name column and its scrolling values (D6)', () => {
  it('joins each group back into one table, every team with its own statistics', () => {
    const { tables, md } = extract(page(group('Eastern Conference') + group('Western Conference')))
    expect(tables).toHaveLength(2)
    for (const table of tables) {
      expect(table.rows[0]).toEqual(['', ...HEAD])
      expect(table.rows.slice(1)).toEqual(joinedRows())
    }
    expect(md).toContain('| [Harbour Owls](https://sport.fixture.test/team/owls) | 5 | 1 | .833 | - |')
    expect(md.indexOf('Eastern Conference')).toBeLessThan(md.indexOf('Western Conference'))
  })

  it('matches rows by the key both tables declare, not by their order', () => {
    const { tables } = extract(page(group('Eastern Conference', { order: [2, 0, 1] })))
    expect(tables).toHaveLength(1)
    expect(tables[0]!.rows.slice(1)).toEqual(joinedRows())
  })

  it('matches rows by position when neither table declares a key', () => {
    const { tables } = extract(page(group('Eastern Conference', { keys: false })))
    expect(tables).toHaveLength(1)
    expect(tables[0]!.rows.slice(1)).toEqual(joinedRows())
  })

  it('keeps two tables apart when anything says they are two', () => {
    const cases: Array<[string, Options]> = [
      ['text between them', { between: '<p>Statistics updated daily.</p>' }],
      ['a heading between them', { between: '<h2>Statistics</h2>' }],
      ['keys that do not match', { nameKeys: (i) => String(i + 10) }],
      ['a different number of rows', { rows: 2 }],
      ['a name table as wide as a data table', { nameCols: (t) => `<td>${t.name}</td><td>x</td><td>y</td>`, nameHead: '<th>Team</th><th>A</th><th>B</th>' }],
      ['a row without a name', { nameCols: (t, i) => (i === 1 ? '<td></td>' : `<td>${t.name}</td>`) }],
      ['spanned cells', { valueHead: '<th colspan="2">Record</th><th>PCT</th><th>GB</th>' }],
      ['a wide table that already starts with the names', { valueCols: (t) => [t.name, ...t.stats].map((s) => `<td>${s}</td>`).join(''), valueHead: ['Team', ...HEAD].map((h) => `<th>${h}</th>`).join('') }],
    ]
    for (const [why, options] of cases) {
      const { tables } = extract(page(group('Eastern Conference', options)))
      expect(tables.length, why).toBe(2)
    }
  })

  it('keeps two side-by-side tables apart when only a heading without text, an image, an icon or a tab tells them apart', () => {
    const board = (head: string, label: string, names: string[], heads: string[], values: string[][]) =>
      `<div class="card">${head.replace('LABEL', label)}<table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
      names.map((n, i) => `<tr><td>${n}</td>${values[i]!.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>'
    for (const head of ['<h3 aria-label="LABEL"><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></h3>', '<h3><img alt="LABEL" src="/i.png"></h3>', '<button role="tab">LABEL</button>']) {
      const html = page(`<section>${board(head, 'Top scorers', ['Alice', 'Bob', 'Cara'], ['Player', 'G'], [['9'], ['7'], ['5']])}` +
        `${board(head, 'Discipline', ['Dan', 'Eve', 'Finn'], ['Name', 'YC', 'RC'], [['4', '1'], ['3', '0'], ['2', '0']])}</section>`)
      const { tables } = extract(html)
      expect(tables.length, head).toBe(2)
    }
    // Two tab panels, each a table: the tabs sit outside the element holding both, the panels are regions of their own.
    const tabs = (pane: (id: string, i: number) => string) => page('<ul role="tablist"><li><a href="#goals" role="tab">Goals</a></li><li><a href="#cards" role="tab">Cards</a></li></ul>' +
      `<div class="tab-content"><div ${pane('goals', 0)}>${board('', '', ['Alice', 'Bob', 'Cara'], ['Name', 'Goals'], [['9'], ['7'], ['5']])}</div>` +
      `<div ${pane('cards', 1)}>${board('', '', ['Dan', 'Eve', 'Finn'], ['Player', 'YC', 'RC'], [['4', '1'], ['3', '0'], ['2', '0']])}</div></div>`)
    for (const pane of [(id: string) => `id="${id}" class="tab-pane" role="tabpanel"`, (id: string) => `id="${id}" class="tab-pane"`, (id: string, i: number) => `class="pane"${i === 1 ? ' hidden' : ''}`]) {
      expect(extract(tabs(pane)).tables.length, pane('x', 1)).toBe(2)
    }
    // The wide table repeats the name column's heading: a table of its own.
    const repeated = page(`<div>${board('', '', ['Alice', 'Bob', 'Cara'], ['Player'], [[], [], []])}${board('', '', ['Dan', 'Eve', 'Finn'], ['Player', 'YC', 'RC'], [['4', '1'], ['3', '0'], ['2', '0']])}</div>`)
    expect(extract(repeated).tables).toHaveLength(2)
  })

  it('does not restore an excluded half or join inside a caller\'s selection', () => {
    const excluded = extract(page(group('Eastern Conference')), { pruneSelectors: ['.scroller'] })
    expect(excluded.md).not.toContain('.833')
    expect(excluded.tables.every((t) => t.rows[0]?.length === 1)).toBe(true)
    const selected = extract(page(group('Eastern Conference')), { includeSelectors: ['.inner'] })
    expect(selected.md).not.toContain('Harbour Owls')
  })
})
