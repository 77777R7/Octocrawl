import { describe, expect, it } from 'vitest'
import { splitStandingsFixture, STANDINGS_TEAMS } from '@w2l/fixtures'
import { extractTf, htmlToMarkdown, htmlToTables } from '../src/index.js'

function extract(kind = 'valid', options = {}) {
  const out = extractTf.extract(splitStandingsFixture(kind), { url: 'https://stats.fixture.test/nba/standings', ...options })
  return { out, md: htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl }), tables: htmlToTables(out.mainHtml, { baseUrl: out.baseUrl }) }
}
describe('source-corroborated split standings', () => {
  for (const kind of ['valid', 'reordered']) it(`joins by local key, preserving context and literal values: ${kind}`, () => {
    const { tables, md } = extract(kind)
    expect(tables).toHaveLength(1)
    const table = tables[0]!
    expect(table.caption).toBe('NBA Preseason Standings 2026-27 — Eastern Conference')
    expect(table.rows[0]).toEqual(['Team', 'W', 'L', 'PCT', 'GB', 'DIFF', 'Season', 'Conference', 'Team UID'])
    for (const [i, team] of STANDINGS_TEAMS.entries()) {
      expect(table.rows[i + 1]).toEqual([team.name, ...team.stats, '2026-27 Preseason', 'Eastern Conference', team.uid])
      expect(md).toContain(`[${team.name}](https://stats.fixture.test${team.url}) | ${team.stats.join(' | ')} | 2026-27 Preseason | Eastern Conference | ${team.uid}`)
    }
  })
  for (const kind of ['wrong-season', 'wrong-phase', 'wrong-selected', 'wrong-url', 'wrong-uid', 'wrong-stats', 'wrong-diff', 'wrong-conference', 'duplicate-payload-team', 'duplicate-key', 'missing-row', 'missing-key', 'orphan-key', 'no-wrapper', 'no-json', 'invalid-json', 'duplicate-json', 'wrong-heading', 'spanned', 'hidden', 'wrong-header', 'missing-uid', 'duplicate-team', 'empty-value', 'duplicate-wrapper']) it(`does not guess ambiguous associations: ${kind}`, () => {
    const { tables } = extract(kind)
    expect(tables.length).toBeGreaterThan(0)
    expect(tables.every(table => table.rows[0]?.includes('Team UID') !== true)).toBe(true)
  })
  it('keeps equal local row keys in separate conferences', () => {
    const { tables } = extract('two-conferences')
    expect(tables).toHaveLength(2)
    expect(tables[0]!.rows[1]).toEqual([STANDINGS_TEAMS[0].name, ...STANDINGS_TEAMS[0].stats, '2026-27 Preseason', 'Eastern Conference', STANDINGS_TEAMS[0].uid])
    expect(tables[1]!.rows[1]).toEqual([STANDINGS_TEAMS[0].name + ' West', ...STANDINGS_TEAMS[0].stats, '2026-27 Preseason', 'Western Conference', STANDINGS_TEAMS[0].uid + '0'])
  })
  it('does not restore caller exclusions or add neighbours to explicit selections', () => {
    expect(extract('valid', { pruneSelectors: ['#team-0'] }).tables).toHaveLength(2)
    const selected = extract('valid', { includeSelectors: ['.stats'] })
    expect(selected.tables).toHaveLength(1)
    expect(selected.md).not.toContain('Harbour Owls')
    expect(selected.md).not.toContain('Team UID')
  })
})
