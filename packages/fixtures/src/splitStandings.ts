/** Fictional teams and values in the retained publisher's split-table carriers. */
export const STANDINGS_TEAMS = [
  { uid: 's:40~l:46~t:901', name: 'Harbour Owls', url: '/nba/team/_/id/901/harbour-owls', stats: ['3', '0', '1.000', '-', '+7.5'] },
  { uid: 's:40~l:46~t:902', name: 'Valley Pines', url: '/nba/team/_/id/902/valley-pines', stats: ['0', '3', '.000', '3', '-7.5'] },
  { uid: 's:40~l:46~t:903', name: 'River Kilns', url: '/nba/team/_/id/903/river-kilns', stats: ['1', '1', '.500', '1.5', '0.0'] },
] as const

export function splitStandingsFixture(kind = 'valid'): string {
  const types = ['wins', 'losses', 'winpercent', 'gamesbehind', 'differential']
  const labels = ['W', 'L', 'PCT', 'GB', 'DIFF']
  // Deliberately different from display order, with a second, unused DIFF.
  const headers = Object.fromEntries(types.map((t, i) => [t, { t, a: labels[i], i: 4 - i }]))
  headers.pointdifferential = { t: 'pointdifferential', a: 'DIFF', i: 5 }
  const group = { name: 'Eastern Conference', standings: STANDINGS_TEAMS.map(team => ({ team: { uid: String(team.uid), displayName: String(team.name), links: String(team.url) }, stats: [...([...team.stats] as string[]).reverse(), '999'] })) }
  const standings = { leagueName: 'nba', leagueUid: 's:40~l:46', requestedDates: { season: 2027, seasontype: 1 }, currentSeason: { year: 2027, seasonType: '1', name: 'Preseason', displayName: '2026-27' }, metadata: { year: '2026-27', seasonType: 'Preseason', seasonTypeId: '1' }, filters: { defaultSelected: { seasontype: 'reg' } }, subheaders: [[{ type: 'team' }, ...types.map(type => ({ type }))]], groups: { headers, groups: [group] } }
  if (kind === 'wrong-season') standings.requestedDates.season = 2026
  if (kind === 'wrong-phase') standings.metadata.seasonType = 'Regular Season'
  if (kind === 'wrong-url') group.standings[0]!.team.links = '/nba/team/_/id/999/wrong'
  if (kind === 'wrong-uid') group.standings[0]!.team.uid = STANDINGS_TEAMS[1].uid
  if (kind === 'wrong-stats') group.standings[0]!.stats = [...group.standings[1]!.stats]
  if (kind === 'wrong-diff') headers.differential!.i = 5
  if (kind === 'wrong-conference') group.name = 'Western Conference'
  if (kind === 'wrong-heading') standings.currentSeason.name = 'Regular Season'
  if (kind === 'duplicate-payload-team') group.standings.push(group.standings[0]!)
  const identity = STANDINGS_TEAMS.map((team, i) => `<tr data-idx="${kind === 'duplicate-key' && i === 1 ? 0 : i}" id="team-${i}"><td><a data-clubhouse-uid="${team.uid}" href="${team.url}">${team.name}</a></td></tr>`).join('')
  const order = kind === 'reordered' ? [2, 0, 1] : [0, 1, 2]
  const stats = order.filter(i => kind !== 'missing-row' || i !== 1).map(i => `<tr ${kind === 'missing-key' && i === 0 ? '' : `data-idx="${kind === 'orphan-key' && i === 0 ? 9 : i}"`}><td>${STANDINGS_TEAMS[i]!.stats.join('</td><td>')}</td></tr>`).join('')
  let tables = `<table class="Table--fixed-left"><thead><tr><th>Team</th></tr></thead><tbody>${identity}</tbody></table><div><table class="stats"><thead><tr>${labels.map(a => `<th>${a}</th>`).join('')}</tr></thead><tbody>${stats}</tbody></table></div>`
  if (kind === 'spanned') tables = tables.replace('<td>3</td>', '<td colspan="2">3</td>')
  if (kind === 'hidden') tables = tables.replace('class="stats"', 'class="stats" hidden')
  if (kind === 'wrong-header') tables = tables.replace('<th>DIFF</th>', '<th>PTS</th>')
  if (kind === 'missing-uid') tables = tables.replace('data-clubhouse-uid="s:40~l:46~t:901"', '')
  if (kind === 'duplicate-team') tables = tables.replaceAll('s:40~l:46~t:902', 's:40~l:46~t:901')
  if (kind === 'cleaned-identity') tables = tables.replace('>Harbour Owls</a>', '><nav>Harbour Owls</nav></a>')
  if (kind === 'empty-value') tables = tables.replace('<td>+7.5</td>', '<td></td>')
  const wrapper = `<div class="${kind === 'no-wrapper' ? '' : 'ResponsiveTable ResponsiveTable--fixed-left'}" id="east"><div class="Table__Title">Eastern Conference</div>${tables}</div>`
  let west = ''
  if (kind === 'two-conferences') {
    west = wrapper.replaceAll('Eastern Conference', 'Western Conference').replaceAll('id="east"', 'id="west"')
    const western = { name: 'Western Conference', standings: group.standings.map(row => ({ team: { uid: row.team.uid + '0', displayName: row.team.displayName + ' West', links: row.team.links + '-west' }, stats: [...row.stats] })) }
    for (const [i, row] of group.standings.entries()) {
      const other = western.standings[i]!
      west = west.replaceAll(row.team.uid, other.team.uid).replaceAll(row.team.displayName, other.team.displayName).replaceAll(row.team.links, other.team.links)
    }
    standings.groups.groups.push(western)
  }
  const json = JSON.stringify({ page: { content: { standings } } })
  const script = kind === 'no-json' ? '' : `<script>window.__CONFIG__={"not":"standings"};window['__espnfitt__']=${kind === 'invalid-json' ? '{broken}' : json};</script>`
  return `<!doctype html><html><head><title>NBA Preseason Standings 2026-27</title></head><body><main><h1>NBA Preseason Standings 2026-27</h1><select aria-label="Standings Season"><option selected value="${kind === 'wrong-selected' ? 2026 : 2027}">2026-27</option></select><select aria-label="Standings Season Type"><option selected value="1">Preseason</option></select>${wrapper}${west}${kind === 'duplicate-wrapper' ? wrapper : ''}</main>${script}${kind === 'duplicate-json' ? script : ''}</body></html>`
}
