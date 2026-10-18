/**
 * ESPN's fixed team table and scrolling statistics share local data-idx keys.
 * A key alone is not a team: require the same capture's declared UID, URL,
 * typed statistics and selected season before combining either source table.
 * No script executes and no hydration-only row or missing value is filled in.
 */
const WRAPPER = '.ResponsiveTable.ResponsiveTable--fixed-left'
const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()
type Obj = Record<string, unknown>
const obj = (x: unknown): Obj | null => x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Obj : null
const get = (x: unknown, k: string): unknown => { const o = obj(x); return o !== null && Object.hasOwn(o, k) ? o[k] : undefined }
const array = (x: unknown): unknown[] => Array.isArray(x) ? x : []
const str = (x: unknown): string => typeof x === 'string' ? x : ''
const scalar = (x: unknown): string => typeof x === 'string' ? x : typeof x === 'number' && Number.isFinite(x) ? String(x) : ''

/** Read a single named JSON object assignment, including pages with config before it. */
function payload(doc: Document): unknown {
  let found: unknown
  let count = 0
  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const text = script.textContent ?? ''
    if (!text.includes('__espnfitt__')) continue
    if (text.length > 3_000_000) return null
    const pattern = /\bwindow(?:\[['"]__espnfitt__['"]\]|\.__espnfitt__)\s*=\s*/g
    for (const match of text.matchAll(pattern)) {
      if (++count !== 1) return null
      const start = match.index + match[0].length
      if (text[start] !== '{') return null
      let depth = 0, quoted = false, escaped = false, end = -1
      for (let i = start; i < text.length; i++) {
        const c = text[i]!
        if (quoted) {
          if (escaped) escaped = false
          else if (c === '\\') escaped = true
          else if (c === '"') quoted = false
        } else if (c === '"') quoted = true
        else if (c === '{' || c === '[') depth++
        else if (c === '}' || c === ']') { if (--depth === 0) { end = i + 1; break } }
      }
      if (end < 0 || !/^\s*(?:;|$)/.test(text.slice(end))) return null
      try { found = JSON.parse(text.slice(start, end)) as unknown } catch { return null }
    }
  }
  return count === 1 ? get(get(get(found, 'page'), 'content'), 'standings') : null
}

function visible(el: Element): boolean {
  for (let p: Element | null = el; p !== null; p = p.parentElement) {
    if (p.hasAttribute('hidden') || p.hasAttribute('data-w2l-hidden') || p.getAttribute('aria-hidden') === 'true' || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(p.getAttribute('style') ?? '')) return false
  }
  return true
}
function url(value: unknown, base: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192) return null
  try {
    const u = base ? new URL(value, base) : new URL(value)
    return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null
  } catch { return null }
}
function selected(doc: Document, label: string): { value: string; text: string; el: Element } | null {
  const controls = Array.from(doc.querySelectorAll('select')).filter(s => s.getAttribute('aria-label') === label)
  if (controls.length !== 1 || !visible(controls[0]!)) return null
  const options = Array.from(controls[0]!.querySelectorAll('option[selected]'))
  return options.length === 1 ? { value: options[0]!.getAttribute('value') ?? '', text: clean(options[0]!.textContent), el: controls[0]! } : null
}
const cells = (row: Element): Element[] => Array.from(row.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH')
function rows(table: Element, header: boolean): Element[] {
  return Array.from(table.querySelectorAll('tr')).filter(r => r.closest('table') === table && (header ? r.parentElement?.tagName === 'THEAD' : r.parentElement?.tagName === 'TBODY'))
}
function keyed(rows: Element[]): Map<string, Element> | null {
  const out = new Map<string, Element>()
  for (const row of rows) {
    const key = row.getAttribute('data-idx') ?? ''
    if (!/^(?:0|[1-9]\d{0,3})$/.test(key) || out.has(key) || !visible(row)) return null
    out.set(key, row)
  }
  return out.size > 0 ? out : null
}
interface TeamRow { identity: Element; stats: Element; name: string; href: string; uid: string; values: string[] }
interface Plan { wrapper: Element; left: Element; right: Element; heading: string; conference: string; season: string; headers: Element[]; teams: TeamRow[] }

/** Collect before cleaning; apply only to source nodes that survive pruning. */
export function prepareSplitStandings(doc: Document, baseUrl?: string | null, excluded: ReadonlySet<Element> = new Set()): () => void {
  const wrappers = Array.from(doc.querySelectorAll(WRAPPER))
  if (wrappers.length === 0 || wrappers.length > 64) return () => {}
  const data = payload(doc), current = get(data, 'currentSeason'), metadata = get(data, 'metadata'), requested = get(data, 'requestedDates')
  const year = get(current, 'year'), phase = str(get(current, 'seasonType')), season = str(get(current, 'displayName')), phaseName = str(get(current, 'name'))
  const heading = `NBA ${phaseName} Standings ${season}`
  const h1s = Array.from(doc.querySelectorAll('h1')).filter(visible)
  const selectedYear = selected(doc, 'Standings Season'), selectedPhase = selected(doc, 'Standings Season Type')
  const contextNodes = [h1s[0], selectedYear?.el, selectedPhase?.el].filter((x): x is Element => x !== undefined)
  if (get(data, 'leagueName') !== 'nba' || get(data, 'leagueUid') !== 's:40~l:46' || !Number.isInteger(year) || !/^[1-4]$/.test(phase) || !/^\d{4}-\d{2}$/.test(season) || !phaseName ||
    h1s.length !== 1 || clean(h1s[0]!.textContent) !== heading || get(requested, 'season') !== year || scalar(get(requested, 'seasontype')) !== phase ||
    get(metadata, 'year') !== season || get(metadata, 'seasonType') !== phaseName || scalar(get(metadata, 'seasonTypeId')) !== phase ||
    selectedYear?.value !== String(year) || selectedYear.text !== season || selectedPhase?.value !== phase || selectedPhase.text !== phaseName ||
    [...excluded].some(e => contextNodes.some(n => e.contains(n) || n.contains(e)))) return () => {}
  const groups = get(data, 'groups'), declaredHeaders = get(groups, 'headers')
  const types = array(get(data, 'subheaders')).flatMap(array).map(x => str(get(x, 'type'))).filter(t => t !== 'team')
  if (types.length === 0 || types.length > 64 || types.some(t => !t) || new Set(types).size !== types.length) return () => {}
  const columns = types.map(t => ({ type: t, definition: get(declaredHeaders, t) }))
  if (columns.some(c => get(c.definition, 't') !== c.type || !str(get(c.definition, 'a')) || !Number.isInteger(get(c.definition, 'i')) || Number(get(c.definition, 'i')) < 0 || Number(get(c.definition, 'i')) > 256)) return () => {}
  if (new Set(columns.map(c => get(c.definition, 'i'))).size !== columns.length) return () => {}
  const allUids = array(get(groups, 'groups')).flatMap(g => array(get(g, 'standings'))).map(r => str(get(get(r, 'team'), 'uid')))
  if (allUids.some(uid => !uid) || new Set(allUids).size !== allUids.length) return () => {}
  const plans: Plan[] = []
  for (const wrapper of wrappers) {
    if (!visible(wrapper) || wrapper.querySelector(WRAPPER) || [...excluded].some(e => e.contains(wrapper) || wrapper.contains(e))) continue
    const titles = Array.from(wrapper.querySelectorAll('.Table__Title')).filter(visible)
    if (titles.length !== 1) continue
    const conference = clean(titles[0]!.textContent)
    const matches = array(get(groups, 'groups')).filter(g => get(g, 'name') === conference)
    // Repeated placements with the same conference are ambiguous too.
    if (!conference || matches.length !== 1 || wrappers.filter(w => clean(w.querySelector('.Table__Title')?.textContent) === conference).length !== 1) continue
    const declaredRows = array(get(matches[0], 'standings'))
    const tables = Array.from(wrapper.querySelectorAll('table'))
    if (tables.length !== 2 || tables.some(t => !visible(t) || t.querySelector('table') || t.querySelector('[rowspan],[colspan],tfoot,caption'))) continue
    const fixed = tables.filter(t => t.classList.contains('Table--fixed-left'))
    if (fixed.length !== 1) continue
    const left = fixed[0]!, right = tables.find(t => t !== left)!
    const leftHead = rows(left, true), rightHead = rows(right, true)
    if (leftHead.length !== 1 || rightHead.length !== 1 || cells(leftHead[0]!).length !== 1) continue
    const headers = cells(rightHead[0]!)
    if (headers.length !== columns.length || headers.some((c, i) => !visible(c) || clean(c.textContent) !== get(columns[i]!.definition, 'a'))) continue
    const identities = keyed(rows(left, false)), stats = keyed(rows(right, false))
    if (!identities || !stats || identities.size !== stats.size || identities.size !== declaredRows.length || identities.size > 512 || [...identities.keys()].some(k => !stats.has(k))) continue
    const teams: TeamRow[] = [], uids = new Set<string>(), urls = new Set<string>()
    for (const [key, identity] of identities) {
      const declared = declaredRows[Number(key)], team = get(declared, 'team'), uid = str(get(team, 'uid')), name = str(get(team, 'displayName')), href = url(get(team, 'links'), baseUrl)
      const teamCells = cells(identity), statRow = stats.get(key)!, statCells = cells(statRow)
      if (teamCells.length !== 1 || statCells.length !== columns.length || !uid || !name || !href || uids.has(uid) || urls.has(href)) break
      const links = Array.from(teamCells[0]!.querySelectorAll('a[href]'))
      if (links.length === 0 || links.some(a => a.getAttribute('data-clubhouse-uid') !== uid || url(a.getAttribute('href'), baseUrl) !== href) || !links.some(a => clean(a.textContent) === name && visible(a))) break
      const values = statCells.map(c => clean(c.textContent)), declaredStats = array(get(declared, 'stats'))
      if (statCells.some(c => !visible(c)) || values.some((v, i) => v === '' || typeof declaredStats[Number(get(columns[i]!.definition, 'i'))] !== 'string' || v !== declaredStats[Number(get(columns[i]!.definition, 'i'))])) break
      uids.add(uid); urls.add(href); teams.push({ identity, stats: statRow, name, href, uid, values })
    }
    if (teams.length === identities.size) plans.push({ wrapper, left, right, heading, conference, season: `${season} ${phaseName}`, headers, teams })
  }
  return () => {
    for (const p of plans) {
      if (!h1s[0]!.isConnected || !p.wrapper.isConnected || !p.left.isConnected || !p.right.isConnected || !visible(p.wrapper)) continue
      if (p.headers.some((h, i) => !h.isConnected || clean(h.textContent) !== get(columns[i]!.definition, 'a'))) continue
      const lostSource = p.teams.some(t => {
        const identityCells = cells(t.identity), statCells = cells(t.stats)
        const links = Array.from(t.identity.querySelectorAll('a[href]'))
        return t.identity.closest('table') !== p.left || t.stats.closest('table') !== p.right || identityCells.length !== 1 ||
          !links.some(a => visible(a) && clean(a.textContent) === t.name && a.getAttribute('data-clubhouse-uid') === t.uid && url(a.getAttribute('href'), baseUrl) === t.href) ||
          statCells.length !== t.values.length || statCells.some((c, i) => !visible(c) || clean(c.textContent) !== t.values[i])
      })
      if (lostSource) continue
      const table = doc.createElement('table'), caption = doc.createElement('caption'), thead = doc.createElement('thead'), header = doc.createElement('tr'), tbody = doc.createElement('tbody')
      caption.textContent = `${p.heading} — ${p.conference}`
      const cell = (tag: string, text: string): Element => { const c = doc.createElement(tag); c.textContent = text; return c }
      header.appendChild(cell('th', 'Team'))
      for (const h of p.headers) header.appendChild(h.cloneNode(true))
      for (const name of ['Season', 'Conference', 'Team UID']) header.appendChild(cell('th', name))
      thead.appendChild(header)
      for (const t of p.teams) {
        const row = doc.createElement('tr')
        // Keep the source identity cell, including its rank, abbreviations and links.
        row.appendChild(cells(t.identity)[0]!.cloneNode(true))
        for (const c of cells(t.stats)) row.appendChild(c.cloneNode(true))
        for (const text of [p.season, p.conference, t.uid]) row.appendChild(cell('td', text))
        tbody.appendChild(row)
      }
      table.append(caption, thead, tbody)
      p.left.replaceWith(table); p.right.remove()
    }
  }
}
