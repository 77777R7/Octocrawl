import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DASHBOARD_BODIES, dashboardPageHtml } from '../scripts/dashboardPages.mjs'

// The dashboard's pages as build-docs.mjs writes them, with dashboard.js run on them in a browser-like window
// (happy-dom) against /api/account answers made up here: what each page shows once the data is in.
const asset = (name: string) => readFileSync(new URL(`../public/docs-assets/${name}`, import.meta.url), 'utf8')
const SCRIPTS = { charts: asset('dashboard-charts.js'), rules: asset('playground-request.js'), dashboard: asset('dashboard.js') }

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)
const KEY_C = 'c'.repeat(64)
const KEYS = [
  { id: KEY_A, label: 'laptop agent', prefix: 'oc_7fQ2', createdAt: '2026-10-05T08:00:00.000Z', enabled: true },
  { id: KEY_B, label: 'ci', prefix: 'oc_Kd91', createdAt: '2026-10-15T08:00:00.000Z', enabled: true },
  { id: KEY_C, label: 'old', prefix: 'oc_Zz00', createdAt: '2026-10-02T08:00:00.000Z', enabled: false },
]
let lineId = 0
type Line = ReturnType<typeof line>
const line = (at: string, keyId: string, credits: number) => ({
  id: String(lineId++).padStart(4, '0'), at, endpoint: 'scrape', keyId, url: 'https://docs.example/a', finalUrl: 'https://docs.example/a', lane: credits === 5 ? 'browser' : 'http',
  status: 'success', httpStatus: 200, reason: null, robots: 'allowed', sha256: 'f'.repeat(64), links: null, kind: credits === 5 ? 'browser' : 'http', credits,
})
/** The usage days the hosted API counts in the same commit as these lines (hostedCredits.ts, settle). */
const usageOf = (lines: Line[]) => {
  const days = new Map<string, { day: string; http: number; browser: number; notFound: number; map: number; unread: number; credits: number }>()
  for (const l of lines) {
    const day = days.get(l.at.slice(0, 10)) ?? { day: l.at.slice(0, 10), http: 0, browser: 0, notFound: 0, map: 0, unread: 0, credits: 0 }
    day[l.kind as 'http' | 'browser'] += 1
    day.credits += l.credits
    days.set(day.day, day)
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day))
}
const account = (resetsAt: string, usage: ReturnType<typeof usageOf>) => ({
  email: 'reader@example.com', providers: ['github.com'],
  credits: { remaining: 988, monthly: { left: 988, of: 1000, resetsAt }, purchased: 0 },
  usage,
  keys: KEYS,
})

interface Call { method: string; path: string; body: unknown }
interface WebEvent { name: string; props: Record<string, unknown> }
interface Page { window: Window; $: (id: string) => HTMLElement; calls: Call[]; events: WebEvent[] }
const open: Window[] = []
afterEach(async () => { await Promise.all(open.splice(0).map(window => window.happyDOM.close())) })

/**
 * A dashboard page at `now`, its API answering from `answers` (path → [status, body]). `width` gives every element that
 * width, for the charts, which draw nothing in a window without layout; `stored` is this browser's localStorage.
 */
async function page(path: string, search: string, now: string, answers: Record<string, [number, unknown]>, options: { width?: number; stored?: Record<string, string>; maxTimeout?: number } = {}): Promise<Page> {
  const [, title, lead, body] = DASHBOARD_BODIES.find(([p]) => p === path)!
  const html = dashboardPageHtml(path, title, lead, body, new Proxy({}, { get: () => 'test' })).replace(/<script\b[^>]*><\/script>/g, '')
  // maxTimeout shortens the page's timers (the Jobs page's polls) to that many milliseconds.
  const window = new Window({ url: `https://octocrawl.dev${path}${search}`, settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true, ...(options.maxTimeout === undefined ? {} : { timer: { maxTimeout: options.maxTimeout } }) } as never })
  open.push(window)
  window.document.write(html)
  if (options.width) Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => options.width })
  for (const [key, value] of Object.entries(options.stored ?? {})) window.localStorage.setItem(key, value)
  const calls: Call[] = []
  const scope = window as unknown as Record<string, unknown>
  scope.fetch = async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ method, path: url, body: init.body ? JSON.parse(init.body) : null })
    const [status, answer] = answers[`${method} ${url}`] ?? [404, { error: 'not_found' }]
    return { ok: status >= 200 && status < 300, status, json: async () => answer, headers: { get: () => null } }
  }
  // The page's events go out by beacon to /api/events; each is kept apart from the API calls, in `events`.
  const events: WebEvent[] = []
  ;(window.navigator as unknown as { sendBeacon: unknown }).sendBeacon = (_url: string, blob: Blob) => { void blob.text().then(text => events.push(JSON.parse(text))); return true }
  // Still, as with reduced motion: no animation frames or timers left running.
  scope.matchMedia = (media: string) => ({ matches: true, media, addEventListener() {}, removeEventListener() {} })
  scope.Option = function Option(text: string, value: string) { const option = window.document.createElement('option'); option.textContent = text; option.value = value; return option }
  window.eval(`(() => { const Real = Date; const NOW = Date.parse(${JSON.stringify(now)}); window.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [NOW])) } static now() { return NOW } } })()`)
  for (const source of [SCRIPTS.charts, SCRIPTS.rules, SCRIPTS.dashboard]) window.eval(source)
  await settle()
  return { window, calls, events, $: (id: string) => window.document.getElementById(id) as unknown as HTMLElement }
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0)) }
const rowsOf = (body: HTMLElement) => [...body.querySelectorAll('tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent))

// October 2026: the request lines began on the 12th, so they do not reach the start of the month.
const OCTOBER = { now: '2026-10-20T12:00:00.000Z', resetsAt: '2026-11-01T00:00:00.000Z' }
const octoberLines = () => [line('2026-10-20T11:55:00.000Z', KEY_A, 1), line('2026-10-18T09:00:00.000Z', KEY_A, 5), line('2026-10-17T09:00:00.000Z', 'playground:u1', 1)]
const octoberAnswers = (lines = octoberLines(), usage = usageOf(lines)) => ({
  'GET /api/account': [200, account(OCTOBER.resetsAt, usage)] as [number, unknown],
  'GET /api/account/activity': [200, { requests: lines, limit: 1000, retentionDays: 30 }] as [number, unknown],
  'GET /api/account/jobs?limit=20': [200, { items: [], nextBefore: null, hasMore: false }] as [number, unknown],
})

describe('the dashboard pages render', () => {
  it('fills every page from /api/account without an error', async () => {
    for (const [path] of DASHBOARD_BODIES) {
      const { $ } = await page(path, '', OCTOBER.now, octoberAnswers())
      expect([path, $('side-credits').textContent]).toEqual([path, '988'])
      expect([path, $('side-renews').textContent]).toEqual([path, 'of 1,000 this month · renews Nov 1 (UTC)'])
      expect([path, $('dash-message').textContent]).toEqual([path, ''])
    }
  })

  it('lists the request lines on Activity, and filters them by key', async () => {
    const { $, window } = await page('/dashboard/activity/', '', OCTOBER.now, octoberAnswers())
    expect(rowsOf($('activity-body'))).toHaveLength(3)
    expect($('activity-count').textContent).toBe('3 of 3 in 30 days')
    const select = $('f-key') as HTMLSelectElement
    select.value = 'playground'
    $('activity-filters').dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event)
    expect(rowsOf($('activity-body'))).toHaveLength(1)
    // A filter that matches nothing is said as such, not as an account without requests; clearing it brings the default text back.
    const search = $('f-search') as HTMLInputElement
    search.value = 'nowhere.example'
    $('activity-filters').dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event)
    expect(rowsOf($('activity-body'))).toHaveLength(0)
    expect($('activity-empty').hidden).toBe(false)
    expect($('activity-empty').textContent).toBe('No requests match these filters.')
    search.value = ''
    select.value = ''
    $('activity-filters').dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event)
    expect($('activity-empty').hidden).toBe(true)
    expect($('activity-empty').textContent).toMatch(/^No requests yet\./)
  })

  it('tells a success the site answered with another page (readiness not_served, #821) from a page that was read, on Activity and in the Results meter', async () => {
    const shown = [
      { ...line('2026-10-20T11:00:00.000Z', KEY_A, 1), url: 'https://docs.example/exhibitor/acme/', finalUrl: 'https://docs.example/', readiness: 'not_served' },
      { ...line('2026-10-20T10:00:00.000Z', KEY_A, 1), readiness: 'ready' },
    ]
    const activity = await page('/dashboard/activity/', '', OCTOBER.now, octoberAnswers(shown))
    const rows = rowsOf(activity.$('activity-body'))
    expect(rows[0]).toContain('200 · another page')
    expect(rows[1]).toContain('200')
    expect(rows[1]).not.toContain('200 · another page')
    const usage = await page('/dashboard/usage/', '', OCTOBER.now, octoberAnswers(shown), { width: 640 })
    const results = [...usage.$('results-list').querySelectorAll('li p')].map(row => row.textContent)
    expect(results).toContain('Read1 · 50%')
    expect(results).toContain('Another page answered1 · 50%')
  })
})

describe('API keys: last used and this month', () => {
  it('shows each key\'s last call and its month so far, as a lower bound where the lines do not reach the 1st', async () => {
    const { $ } = await page('/dashboard/keys/', '', OCTOBER.now, octoberAnswers())
    const rows = rowsOf($('keys-body'))
    // Name, key, created, last used, this month, status, action.
    expect(rows[0]!.slice(3, 5)).toEqual(['5 min ago', 'at least 6 credits · 2 calls'])
    // Made after the lines began: every call it made would be among them.
    expect(rows[1]!.slice(3, 5)).toEqual(['Not yet', '0 credits · 0 calls'])
    expect(rows[2]!.slice(3, 5)).toEqual(['None since Oct 12', 'at least 0 credits · 0 calls'])
    expect($('keys-body').querySelectorAll('td')[4]!.getAttribute('title')).toMatch(/do not reach the start of the month/)
  })

  it('gives the month exactly once the lines cover it, and a lower bound again when the page holds only the latest lines', async () => {
    const now = '2026-11-20T12:00:00.000Z'
    const lines = [line('2026-11-20T09:00:00.000Z', KEY_A, 1), line('2026-11-02T09:00:00.000Z', KEY_A, 5), line('2026-10-25T09:00:00.000Z', KEY_A, 5)]
    // The old key's call on Oct 21 at 09:00 is more than 30 days back, so the server leaves its line out: the page may
    // not say that key had no call on Oct 21.
    const usage = usageOf([line('2026-10-21T09:00:00.000Z', KEY_C, 1), ...lines])
    const answers = (shown: Line[], limit: number) => ({ 'GET /api/account': [200, account('2026-12-01T00:00:00.000Z', usage)] as [number, unknown], 'GET /api/account/activity': [200, { requests: shown, limit, retentionDays: 30 }] as [number, unknown] })
    const whole = await page('/dashboard/keys/', '', now, answers(lines, 1000))
    expect(rowsOf(whole.$('keys-body'))[0]!.slice(3, 5)).toEqual(['3 h ago', '6 credits · 2 calls'])
    expect(rowsOf(whole.$('keys-body'))[2]![3]).toBe('None since Oct 22')
    // Only the latest lines: they still reach back past the 1st, so the month is whole; the oldest line's own day is not.
    const cut = await page('/dashboard/keys/', '', now, answers(lines, 3))
    expect(rowsOf(cut.$('keys-body'))[0]![4]).toBe('6 credits · 2 calls')
    expect(rowsOf(cut.$('keys-body'))[2]!.slice(3, 5)).toEqual(['None since Oct 26', '0 credits · 0 calls'])
    // Cut short after the 1st: what they hold is a lower bound.
    const short = await page('/dashboard/keys/', '', now, answers(lines.slice(0, 2), 2))
    expect(rowsOf(short.$('keys-body'))[0]![4]).toBe('at least 6 credits · 2 calls')
    expect(rowsOf(short.$('keys-body'))[2]![3]).toBe('None since Nov 3')
  })

  it('claims nothing exact when a covered day has calls without a request line', async () => {
    // A settle whose first commit failed is sent again without its line: the day's usage counts a call the lines lack.
    const lines = octoberLines()
    const { $ } = await page('/dashboard/keys/', '', OCTOBER.now, octoberAnswers(lines, usageOf([...lines, line('2026-10-19T10:00:00.000Z', KEY_B, 1)])))
    const rows = rowsOf($('keys-body'))
    expect(rows[0]!.slice(3, 5)).toEqual(['5 min ago or later', 'at least 6 credits · 2 calls'])
    expect(rows[1]!.slice(3, 5)).toEqual(['Unknown', 'at least 0 credits · 0 calls'])
    expect(rows[2]![3]).toBe('Unknown')
    const overview = await page('/dashboard/', '', OCTOBER.now, octoberAnswers(lines, usageOf([...lines, line('2026-10-19T10:00:00.000Z', KEY_B, 1)])))
    expect(overview.$('keys-mini-sub').textContent).toBe('2 of 5 active · last call 5 min ago or later')
    const today = [line('2026-10-20T11:55:00.000Z', KEY_A, 1), line('2026-10-20T10:00:00.000Z', KEY_A, 1)]
    const full = await page('/dashboard/', '', OCTOBER.now, { ...octoberAnswers(today), 'GET /api/account/activity': [200, { requests: today, limit: 2, retentionDays: 30 }] })
    expect(full.$('keys-mini-sub').textContent).toBe('2 of 5 active · last call 5 min ago or later')
    // A call more than a day old shows as its date, which a dropped line later that day leaves true.
    const older = [line('2026-10-20T11:55:00.000Z', KEY_B, 1), line('2026-10-18T21:00:00.000Z', KEY_A, 1)]
    const keys = await page('/dashboard/keys/', '', OCTOBER.now, { ...octoberAnswers(older), 'GET /api/account/activity': [200, { requests: older, limit: 2, retentionDays: 30 }] })
    expect(rowsOf(keys.$('keys-body'))[0]![3]).toBe('Oct 18')
  })

  it('takes a job\'s pages off the day\'s usage before it checks the lines, and counts a job as one call of its key', async () => {
    // Twelve pages of a job, read the day before it finished: the usage counts them, and no line stands for each.
    const job = { ...line('2026-10-20T11:50:00.000Z', KEY_B, 3), endpoint: 'batch', kind: 'job', status: 'completed', httpStatus: null, lane: null, formats: null, robots: null, sha256: null, job: { id: 'job-1', requested: 12, pages: 12, errors: 9, outcomes: { read: 3, robots_unreachable: 9 } } }
    const calls = octoberLines()
    const usage = usageOf(calls).map((day) => ({ ...day, jobPages: 0 }))
    const before = usage.find((day) => day.day === '2026-10-18')!
    before.unread += 9; before.http += 3; before.jobPages = 12
    const answers = octoberAnswers([calls[0]!, job, ...calls.slice(1)], usage)
    const rows = rowsOf((await page('/dashboard/keys/', '', OCTOBER.now, answers)).$('keys-body'))
    expect(rows[0]!.slice(3, 5)).toEqual(['5 min ago', 'at least 6 credits · 2 calls'])
    expect(rows[1]!.slice(3, 5)).toEqual(['10 min ago', '3 credits · 1 call'])
    // Pages that are neither a line's nor a job's still say so.
    before.unread += 1
    expect(rowsOf((await page('/dashboard/keys/', '', OCTOBER.now, answers)).$('keys-body'))[0]![3]).toBe('5 min ago or later')
  })

  it('compares the lines with the usage read before them, not with usage read again after a revoke', async () => {
    const lines = octoberLines()
    const answers: Record<string, [number, unknown]> = { ...octoberAnswers(lines), [`POST /api/account/keys/${KEY_A}/revoke`]: [204, null] }
    const keys = await page('/dashboard/keys/', '', OCTOBER.now, answers)
    // A call lands after the lines were read: the account's usage now counts it, the page's lines do not.
    answers['GET /api/account'] = [200, account(OCTOBER.resetsAt, usageOf([...lines, line('2026-10-20T11:58:00.000Z', KEY_B, 1)]))]
    const revoke = keys.$('keys-body').querySelector('button')!
    revoke.click(); revoke.click()
    await settle()
    expect(keys.calls.filter(call => call.path === '/api/account')).toHaveLength(2)
    const rows = rowsOf(keys.$('keys-body'))
    expect(rows[0]!.slice(3, 5)).toEqual(['5 min ago', 'at least 6 credits · 2 calls'])
    expect(rows[1]!.slice(3, 5)).toEqual(['Not yet', '0 credits · 0 calls'])
  })

  it('says why nothing is claimed when a full page of lines is all from today', async () => {
    const lines = [line('2026-10-20T11:55:00.000Z', KEY_A, 1), line('2026-10-20T10:00:00.000Z', KEY_A, 1)]
    const { $ } = await page('/dashboard/keys/', '', OCTOBER.now, { ...octoberAnswers(lines), 'GET /api/account/activity': [200, { requests: lines, limit: 2, retentionDays: 30 }] })
    const rows = rowsOf($('keys-body'))
    // Today is the part day before the first whole one, so a dropped line today could not be seen.
    expect(rows[0]![3]).toBe('5 min ago or later')
    expect(rows[1]![3]).toBe('Unknown')
    expect($('keys-body').querySelectorAll('tr')[1]!.querySelectorAll('td')[3]!.getAttribute('title')).toBe('The page holds only the latest 2 request lines, all from today, so this is not known.')
  })

  it('does not give a last call from the unchecked part day before the lines\' first whole day as exact', async () => {
    // Cut at two lines, the oldest yesterday evening: today is checked, yesterday evening is not.
    const lines = [line('2026-10-20T11:55:00.000Z', KEY_A, 1), line('2026-10-19T21:00:00.000Z', KEY_B, 1)]
    const { $ } = await page('/dashboard/keys/', '', OCTOBER.now, { ...octoberAnswers(lines), 'GET /api/account/activity': [200, { requests: lines, limit: 2, retentionDays: 30 }] })
    expect(rowsOf($('keys-body'))[1]![3]).toBe('15 h ago or later')
  })

  it('says on the Overview how many keys are active and when one last called, beside each key', async () => {
    const { $ } = await page('/dashboard/', '', OCTOBER.now, octoberAnswers())
    expect($('keys-mini-sub').textContent).toBe('2 of 5 active · last call 5 min ago')
    expect([...$('keys-mini').querySelectorAll('li')].map(item => item.textContent)).toEqual(['laptop agentoc_7fQ2…5 min ago', 'cioc_Kd91…Not yet'])
    const quiet = await page('/dashboard/', '', OCTOBER.now, octoberAnswers([]))
    expect(quiet.$('keys-mini-sub').textContent).toBe('2 of 5 active · no calls since Oct 12')
  })
})

describe('MCP connections', () => {
  const GRANT = 'g'.repeat(24)
  const CONNECTION_KEY = `oauth_${GRANT}`
  const CONNECTIONS = [{ id: GRANT, keyId: CONNECTION_KEY, name: 'ChatGPT', host: 'chatgpt.com', createdAt: '2026-10-14T08:00:00.000Z', lastUsedAt: '2026-10-20T11:00:00.000Z' }]
  const answers = (connections = CONNECTIONS): Record<string, [number, unknown]> => {
    const lines = [line('2026-10-20T11:50:00.000Z', CONNECTION_KEY, 5), ...octoberLines()]
    return {
      'GET /api/account': [200, { ...account(OCTOBER.resetsAt, usageOf(lines)), connections }],
      'GET /api/account/activity': [200, { requests: lines, limit: 1000, retentionDays: 30 }],
      [`POST /api/account/connections/${GRANT}/revoke`]: [204, null],
    }
  }

  it('lists each connection with the app, where it returns, and its use counted as a key\'s, apart from the keys', async () => {
    const keys = await page('/dashboard/keys/', '', OCTOBER.now, answers())
    const rows = rowsOf(keys.$('connections-body'))
    // App, returns to, connected, last used, this month, action. Connected since the lines began: its month is exact.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.slice(0, 5)).toEqual(['ChatGPT', 'chatgpt.com', '2026-10-14', '10 min ago', '5 credits · 1 call'])
    expect(keys.$('connections-empty').hidden).toBe(true)
    // Not a key: the keys table and its count of five leave it out.
    expect(rowsOf(keys.$('keys-body')).map(row => row[0])).toEqual(['laptop agent', 'ci', 'old'])
    const activity = await page('/dashboard/activity/', '', OCTOBER.now, answers())
    // Activity names its calls by the app.
    expect([...activity.$('f-key').querySelectorAll('option')].map(option => option.textContent)).toContain('ChatGPT (chatgpt.com)')
    expect(activity.$('activity-body').querySelector('tr')!.getAttribute('title')).toBe('Key: ChatGPT (chatgpt.com)')
  })

  it('disconnects on a second click, says it stops within a minute, and loads the list again', async () => {
    const given = answers()
    const keys = await page('/dashboard/keys/', '', OCTOBER.now, given)
    given['GET /api/account'] = [200, { ...(given['GET /api/account']![1] as object), connections: [] }]
    const button = keys.$('connections-body').querySelector('button')!
    expect(button.textContent).toBe('Disconnect')
    button.click()
    expect(button.textContent).toBe('Click again to disconnect')
    expect(keys.calls.some(call => call.method === 'POST')).toBe(false)
    button.click()
    await settle()
    expect(keys.calls.filter(call => call.method === 'POST').map(call => call.path)).toEqual([`/api/account/connections/${GRANT}/revoke`])
    expect(keys.$('dash-message').textContent).toBe('Disconnected ChatGPT. It stops working within a minute.')
    expect(rowsOf(keys.$('connections-body'))).toEqual([])
    expect(keys.$('connections-empty').hidden).toBe(false)
  })

  it('shows none on an account without connections, or a server that sends no list', async () => {
    const none = await page('/dashboard/keys/', '', OCTOBER.now, octoberAnswers())
    expect(rowsOf(none.$('connections-body'))).toEqual([])
    expect(none.$('connections-empty').hidden).toBe(false)
  })
})

describe('Connect leads with sign-in', () => {
  const AGENTS = ['claude', 'codex', 'cursor', 'opencode', 'cline']
  const text = (page: Page, selector: string) => [...page.window.document.querySelectorAll(selector)].map(node => node.textContent ?? '')

  it('gives each agent the sign-in URL first, with no key, and folds the key setup under "Use an API key instead"', async () => {
    const connect = await page('/dashboard/connect/', '', OCTOBER.now, octoberAnswers())
    for (const id of AGENTS) {
      const first = text(connect, `#c-${id} .install-body > .code pre`)
      expect(first.join('\n'), id).toContain('https://mcp.octocrawl.dev/mcp-oauth')
      expect(first.join('\n'), id).not.toContain('oc_YOUR_KEY')
      const alternative = connect.window.document.querySelector(`#c-${id} details.key-alt`) as unknown as HTMLDetailsElement
      expect(alternative, id).not.toBeNull()
      expect(alternative.open, id).toBe(false)
      expect(alternative.querySelector('summary')!.textContent, id).toBe('Use an API key instead')
      const keyed = text(connect, `#c-${id} details.key-alt pre`).join('\n')
      expect(keyed, id).toContain('oc_YOUR_KEY')
      expect(keyed, id).toContain('https://mcp.octocrawl.dev/mcp')
      expect(keyed, id).not.toContain('/mcp-oauth')
    }
    // Claude Code: add, then sign in from /mcp.
    expect(text(connect, '#c-claude .install-body > .code pre')[0]).toBe('claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp-oauth')
    // Codex: `codex mcp add` starts the sign-in itself (Codex CLI 0.162.1).
    expect(text(connect, '#c-codex .install-body > .code pre')[0]).toBe('codex mcp add octocrawl --url https://mcp.octocrawl.dev/mcp-oauth')
  })

  it('lists coding agents only: no chat-app cards', async () => {
    const connect = await page('/dashboard/connect/', '', OCTOBER.now, octoberAnswers())
    expect([...connect.window.document.querySelectorAll('.install-row')].map(row => row.id)).toEqual(AGENTS.map(id => `c-${id}`))
  })

  it('says which sign-ins have been checked with the real client, and which were only tested with its settings', async () => {
    const connect = await page('/dashboard/connect/', '', OCTOBER.now, octoberAnswers())
    // Checked with the real client (research/hosted/2026-10-16-mcp-oauth-clients-adee17f2.md): Claude Code, Cursor, Codex and OpenCode.
    for (const [id, name, day] of [['claude', 'Claude Code', '2026-10-16'], ['cursor', 'Cursor', '2026-10-16'], ['codex', 'Codex', '2026-10-17'], ['opencode', 'OpenCode', '2026-10-17']]) {
      expect(connect.$(`c-${id}`).querySelector('.client-status')!.textContent, id).toBe(`Sign-in checked with ${name} on ${day}`)
      expect(connect.$(`c-${id}`).querySelector('.client-status')!.classList.contains('is-verified'), id).toBe(true)
    }
    // Cline: tested with the OAuth settings its source sends, not run in Cline (same record, "Cline" section).
    const cline = connect.$('c-cline').querySelector('.client-status')!
    expect(cline.textContent).toBe('Sign-in tested on 2026-10-17 with the OAuth settings Cline sends; not yet run in Cline itself')
    expect(cline.textContent).not.toMatch(/checked with/)
    expect(cline.classList.contains('is-verified')).toBe(false)
    expect(cline.classList.contains('is-tested')).toBe(true)
  })

  it('names both MCP URLs: sign-in, and keyless or a key', async () => {
    const connect = await page('/dashboard/connect/', '', OCTOBER.now, octoberAnswers())
    expect(connect.$('mcp-url-oauth').textContent).toBe('https://mcp.octocrawl.dev/mcp-oauth')
    expect(connect.$('mcp-url').textContent).toBe('https://mcp.octocrawl.dev/mcp')
  })
})

describe('Connect fills in a key', () => {
  const KEY = `oc_${'x'.repeat(43)}`
  const MASKED = `oc_xxxx${'•'.repeat(12)}`
  const setups = (page: Page) => [...page.window.document.querySelectorAll('#main-content pre')].map(pre => pre.textContent ?? '')
  const copied = (page: Page) => [...page.window.document.querySelectorAll('#main-content pre')].map(pre => (pre as unknown as HTMLElement).dataset.full ?? pre.textContent ?? '')

  it('puts a pasted key in every setup that asks for one, masked until shown, and takes it out again', async () => {
    const connect = await page('/dashboard/connect/', '', OCTOBER.now, octoberAnswers())
    const before = setups(connect)
    const asking = before.filter(text => text.includes('oc_YOUR_KEY'))
    // Five agents, and the four languages in From code.
    expect(asking.length).toBe(9)
    const input = connect.$('fill-key') as HTMLInputElement
    // A text field masked by its class: a password field would have the browser offer to save the key.
    expect([input.type, input.classList.contains('masked')]).toEqual(['text', true])
    input.value = KEY
    input.dispatchEvent(new connect.window.Event('input') as unknown as Event)
    // Shown masked; Copy takes the whole key.
    expect(setups(connect).filter(text => text.includes('oc_YOUR_KEY'))).toEqual([])
    expect(setups(connect).filter(text => text.includes(KEY))).toEqual([])
    expect(setups(connect).filter(text => text.includes(MASKED))).toHaveLength(asking.length)
    expect(copied(connect)).toContain(`claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp --header "Authorization: Bearer ${KEY}"`)
    expect(copied(connect).filter(text => text.includes(KEY))).toHaveLength(asking.length)
    expect(connect.$('fill-note').textContent).toBe('Every key setup on this page carries oc_xxxx…; Copy takes the whole key.')
    // The eye shows it, in the field and in every setup, and hides it again.
    connect.$('fill-eye').click()
    expect([input.classList.contains('masked'), connect.$('fill-eye').getAttribute('aria-pressed')]).toEqual([false, 'true'])
    expect(setups(connect).filter(text => text.includes(KEY))).toHaveLength(asking.length)
    connect.$('fill-eye').click()
    expect(setups(connect).filter(text => text.includes(KEY))).toEqual([])
    // Not a key: the setups go back to the placeholder, and the page says why.
    input.value = 'sk-something'
    input.dispatchEvent(new connect.window.Event('input') as unknown as Event)
    expect(setups(connect)).toEqual(before)
    expect(copied(connect)).toEqual(before)
    expect(connect.$('fill-note').textContent).toMatch(/starts with oc_/)
    // The key never left the page.
    expect(connect.calls.map(call => call.path)).toEqual(['/api/account'])
    // Not in a form, so Enter can never send it in a URL, with or without the script.
    expect(input.closest('form')).toBeNull()
  })

  it('makes a key on the page and fills it in', async () => {
    const connect = await page('/dashboard/connect/', '', OCTOBER.now, { ...octoberAnswers(), 'POST /api/account/keys': [201, { key: KEY, id: 'd'.repeat(64) }] })
    connect.$('fill-create').click()
    await settle()
    expect(connect.calls.find(call => call.method === 'POST')).toEqual({ method: 'POST', path: '/api/account/keys', body: { label: 'Agent setup' } })
    expect((connect.$('fill-key') as HTMLInputElement).value).toBe(KEY)
    expect(copied(connect).filter(text => text.includes(KEY))).toHaveLength(9)
    expect(connect.$('fill-note').textContent).toMatch(/^Made a key named Agent setup \(oc_xxxx…\)/)
    expect(connect.$('conn-key').textContent).toBe('oc_7fQ2… (laptop agent)')
  })

  it('says so when the account already holds five keys', async () => {
    const connect = await page('/dashboard/connect/', '', OCTOBER.now, { ...octoberAnswers(), 'POST /api/account/keys': [409, { error: 'too_many_keys', limit: 5 }] })
    connect.$('fill-create').click()
    await settle()
    expect(connect.$('dash-message').textContent).toBe('An account holds at most five active keys. Revoke one in API keys first.')
    expect(setups(connect).some(text => text.includes('oc_YOUR_KEY'))).toBe(true)
  })

  it('shows one language at a time in From code, and opens the one an Overview tile links to', async () => {
    const connect = await page('/dashboard/connect/', '#c-sdk', OCTOBER.now, octoberAnswers())
    const shown = () => [...connect.window.document.querySelectorAll('[data-code-pane]')].filter(pane => !(pane as unknown as HTMLElement).hidden).map(pane => (pane as unknown as HTMLElement).dataset.codePane)
    expect(shown()).toEqual(['sdk'])
    ;(connect.window.document.querySelector('[data-code-tab="python"]') as unknown as HTMLElement).click()
    expect(shown()).toEqual(['python'])
    expect(connect.$('c-python-code').textContent).toContain('W2L(base_url="https://api.octocrawl.dev", token="oc_YOUR_KEY")')
    expect(connect.$('c-ts-code').textContent).toContain("new W2L({ baseUrl: 'https://api.octocrawl.dev', token: 'oc_YOUR_KEY' })")
  })
})

describe('the Playground takes over what the home page asked for', () => {
  it('sets the URL, the view, the whole page and the fields from its address', async () => {
    const search = '?url=https%3A%2F%2Fshop.example%2Fp%2F1&view=json&scope=whole&field=price%3Anumber&field=tags%3Astring%5B%5D'
    const { $, window } = await page('/dashboard/scrape/', search, OCTOBER.now, octoberAnswers())
    const form = $('play-form') as HTMLFormElement
    expect((window.document.getElementById('play-url') as unknown as HTMLInputElement).value).toBe('https://shop.example/p/1')
    expect(new window.FormData(form as never).get('view')).toBe('json')
    expect(new window.FormData(form as never).get('scope')).toBe('whole')
    expect([...form.querySelectorAll('.pg-field input')].map(input => (input as HTMLInputElement).value)).toEqual(['price', 'tags'])
    expect($('pg-format-label').textContent).toBe('JSON')
    // Get code asks for what the run will: the whole page, and the fields as a schema.
    const code = $('play-code').textContent!
    expect(code).toContain('"onlyMainContent":false')
    expect(code).toContain('"price":{"type":["number","null"]}')
  })

  it('keeps the defaults when the address carries only a URL', async () => {
    const { $, window } = await page('/dashboard/scrape/', '?url=https%3A%2F%2Fdocs.example%2F', OCTOBER.now, octoberAnswers())
    const form = new window.FormData($('play-form') as never)
    expect([form.get('url'), form.get('view'), form.get('scope')]).toEqual(['https://docs.example/', 'markdown', 'main'])
    expect($('play-form').querySelectorAll('.pg-field')).toHaveLength(0)
  })
})

describe('the Playground says what a result is', () => {
  const record = {
    requestedUrl: 'https://docs.example/a', finalUrl: 'https://docs.example/', fetchedAt: '2026-10-20T11:00:00.000Z', httpStatus: 200, status: 'success', reason: null, lane: 'http',
    robotsDecision: { decision: 'disallowed', robotsUrl: 'https://docs.example/robots.txt', unreachable: 'timeout' }, rawSha256: 'f'.repeat(64), outputSha256: { markdown: 'e'.repeat(64) }, extractor: { name: 'extract-tf', version: 'extract-tf/48' },
  }
  const hint = 'docs.example answered https://docs.example/ in place of https://docs.example/a; check that the link is still live'
  const elsewhere = { status: 'success', requestedUrl: 'https://docs.example/a', markdown: '# Home', warnings: [{ code: 'redirected_off_page', message: 'The site sent the request on.' }], readiness: { state: 'not_served', basis: ['redirected_off_page'] }, agentHints: [hint], evidenceRecord: record }
  const run = async (answer: unknown) => {
    const opened = await page('/dashboard/scrape/', '?url=https%3A%2F%2Fdocs.example%2Fa', OCTOBER.now, { ...octoberAnswers(), 'POST /api/account/run': [200, answer] })
    opened.$('play-form').dispatchEvent(new opened.window.Event('submit', { bubbles: true, cancelable: true }))
    await settle()
    return opened
  }
  const evidenceRows = ($: Page['$']) => [...$('play-evidence').querySelectorAll('dt')].map((term, i) => [term.textContent, $('play-evidence').querySelectorAll('dd')[i]!.textContent])

  it('marks a page the site answered in place of the one asked for, names both, and says the next step (#821)', async () => {
    const { $ } = await run(elsewhere)
    expect($('play-status').textContent).toBe('success · another page')
    expect($('play-status').className).toBe('status warn')
    expect($('play-detail').textContent).toMatch(/^Asked for https:\/\/docs\.example\/a; the site answered https:\/\/docs\.example\/ · HTTP 200 · http lane/)
    expect($('play-next').hidden).toBe(false)
    expect($('play-next').textContent).toBe(`Next: ${hint}`)
    // The Evidence Record tells a robots.txt that could not be read from a rule the site wrote.
    ;($('play-result').querySelector('[data-view="evidence"]') as HTMLElement).click()
    await settle()
    expect(evidenceRows($)).toContainEqual(['robots.txt', 'unreachable (timeout): counts as a disallow, not a rule the site wrote'])
  })

  it('shows a page that was read as read, with no next step, and a failed one with its reason and hint', async () => {
    const read = { ...elsewhere, warnings: [], readiness: { state: 'ready', basis: [] }, agentHints: [], evidenceRecord: { ...record, finalUrl: 'https://docs.example/a', robotsDecision: { decision: 'allowed', robotsUrl: 'https://docs.example/robots.txt', unreachable: null } } }
    const ok = await run(read)
    expect(ok.$('play-status').textContent).toBe('success')
    expect(ok.$('play-status').className).toBe('status ok')
    expect(ok.$('play-detail').textContent).toMatch(/^https:\/\/docs\.example\/a · HTTP 200 · http lane/)
    expect(ok.$('play-next').hidden).toBe(true)
    ;(ok.$('play-result').querySelector('[data-view="evidence"]') as HTMLElement).click()
    await settle()
    expect(evidenceRows(ok.$)).toContainEqual(['robots.txt', 'allowed'])
    const failed = await run({ status: 'failed', failureReason: 'timeout', requestedUrl: 'https://docs.example/a', markdown: null, agentHints: ['no lane answered within the request\'s deadline; raise timeout (up to 300000 ms over REST, 180000 ms from an MCP tool)'], evidenceRecord: { ...record, status: 'failed', reason: 'timeout', httpStatus: null, finalUrl: 'https://docs.example/a' } })
    expect(failed.$('play-status').textContent).toBe('failed · timeout')
    expect(failed.$('play-status').className).toBe('status bad')
    expect(failed.$('play-next').textContent).toBe('Next: no lane answered within the request\'s deadline; raise timeout (up to 300000 ms over REST, 180000 ms from an MCP tool)')
  })

  it('reports the page view and each run\'s outcome to /api/events, by status and reason, never with the URL', async () => {
    const events = (opened: Page) => opened.events
    const ok = await run({ ...elsewhere, warnings: [], readiness: { state: 'ready', basis: [] }, agentHints: [], evidenceRecord: { ...record, finalUrl: 'https://docs.example/a' } })
    expect(events(ok)).toEqual([{ name: 'page_view', props: { path: '/dashboard/scrape/' } }, { name: 'playground_run', props: { path: '/dashboard/scrape/', view: 'scrape', outcome: 'ok' } }])
    expect(JSON.stringify(events(ok))).not.toContain('docs.example')
    expect(events(await run(elsewhere)).at(-1)!.props).toMatchObject({ outcome: 'failed', reason: 'off_page' })
    const blocked = await run({ status: 'blocked', blockReason: 'cloudflare_challenge', requestedUrl: 'https://docs.example/a', markdown: null, agentHints: [], evidenceRecord: { ...record, status: 'blocked', reason: 'cloudflare_challenge' } })
    expect(events(blocked).at(-1)!.props).toMatchObject({ outcome: 'failed', reason: 'cloudflare_challenge' })
    // A refused call says its HTTP status; a copied setup line names its block, never its text.
    const refused = await page('/dashboard/scrape/', '', OCTOBER.now, { ...octoberAnswers(), 'POST /api/account/run': [429, { error: 'daily limit' }] })
    ;(refused.$('play-form').querySelector('input[name="url"]') as HTMLInputElement).value = 'https://docs.example/a'
    refused.$('play-form').dispatchEvent(new refused.window.Event('submit', { bubbles: true, cancelable: true }))
    await settle()
    expect(events(refused).at(-1)).toEqual({ name: 'playground_run', props: { path: '/dashboard/scrape/', view: 'scrape', outcome: 'refused', reason: 'http_429' } })
  })

  it('offers the same task from the person\'s agent under a page that was read, and not under one that was not', async () => {
    const ok = await run({ ...elsewhere, warnings: [], readiness: { state: 'ready', basis: [] }, agentHints: [], evidenceRecord: { ...record, finalUrl: 'https://docs.example/a' } })
    expect(ok.$('play-agent').hidden).toBe(false)
    expect(ok.$('play-agent-line').textContent).toBe('claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp-oauth')
    expect(ok.$('play-agent').querySelector('a')!.getAttribute('href')).toBe('/dashboard/connect/')
    Object.defineProperty(ok.window.navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } })
    ;(ok.$('play-agent').querySelector('[data-copy]') as HTMLElement).click()
    await settle()
    expect(ok.events.at(-1)).toEqual({ name: 'setup_copy', props: { path: '/dashboard/scrape/', target: 'dashboard', client: 'play-agent-line' } })
    const failed = await run({ status: 'failed', failureReason: 'timeout', requestedUrl: 'https://docs.example/a', markdown: null, agentHints: [], evidenceRecord: { ...record, status: 'failed', reason: 'timeout' } })
    expect(failed.$('play-agent').hidden).toBe(true)
    // A page the site answered in place of the one asked for is not a read either.
    expect((await run(elsewhere)).$('play-agent').hidden).toBe(true)
  })

  it('reports a copied setup line by its block on Connect', async () => {
    const connect = await page('/dashboard/connect/', '', OCTOBER.now, octoberAnswers())
    Object.defineProperty(connect.window.navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } })
    const button = connect.window.document.querySelector('[data-copy="signin-claude"]') as unknown as HTMLElement
    button.click()
    await settle()
    expect(connect.events.at(-1)).toEqual({ name: 'setup_copy', props: { path: '/dashboard/connect/', target: 'dashboard', client: 'signin-claude' } })
  })

  it('says in plain words why a page was not read and offers a page that reads; a page that was read gets none', async () => {
    const help = ($: Page['$']) => ({ hidden: $('play-help').hidden, title: $('play-help').querySelector('.pg-help-title')?.textContent, actions: [...$('play-help').querySelectorAll('.pg-link')].map(a => a.textContent) })
    const notRead = (extra: Record<string, unknown>, ev: Record<string, unknown> = {}) => ({ requestedUrl: 'https://docs.example/a', markdown: null, agentHints: [], ...extra, evidenceRecord: { ...record, robotsDecision: { decision: 'allowed', robotsUrl: 'https://docs.example/robots.txt', unreachable: null }, httpStatus: null, ...ev } })
    const blocked = await run(notRead({ status: 'blocked', blockReason: 'cloudflare_challenge' }, { status: 'blocked', reason: 'cloudflare_challenge', httpStatus: 403 }))
    expect(help(blocked.$)).toEqual({ hidden: false, title: 'The site stopped the read with a bot check', actions: ['Try a page that reads', 'Read it on your computer →', 'Ask us about this page'] })
    expect(blocked.$('play-help').querySelector('a[href="/docs/connect-mcp/#run-it-on-your-computer"]')).not.toBeNull()
    expect(help((await run(notRead({ status: 'failed', failureReason: 'timeout' }, { status: 'failed', reason: 'timeout' }))).$).title).toBe('The page took too long to answer')
    expect(help((await run(notRead({ status: 'failed', failureReason: 'http_error' }, { status: 'failed', reason: 'http_error', httpStatus: 404 }))).$)).toMatchObject({ title: 'There is no page at this address (HTTP 404)', actions: ['Try a page that reads', 'Ask us about this page'] })
    const disallowed = { status: 'failed', reason: 'policy_denied', robotsDecision: { decision: 'disallowed', robotsUrl: 'https://docs.example/robots.txt', unreachable: null } }
    expect(help((await run(notRead({ status: 'failed', failureReason: 'policy_denied' }, disallowed))).$)).toMatchObject({ title: 'This site\'s robots.txt keeps Octocrawl out', actions: ['Try a page that reads', 'Read it on your computer →', 'Ask us about this page'] })
    // A rule that names Octocrawl is not set aside on a local server either, so the box does not send the reader there.
    const byName = notRead({ status: 'failed', failureReason: 'policy_denied', trace: [{ event: 'robots_checked', detail: { matchedGroup: 'octocrawl' } }] }, disallowed)
    expect(help((await run(byName)).$)).toEqual({ hidden: false, title: 'This site\'s robots.txt keeps Octocrawl out by name', actions: ['Try a page that reads', 'Ask us about this page'] })
    // The sample is put in the form and run: the next answer is the page that reads.
    const { $, window } = blocked
    ;([...$('play-help').querySelectorAll('button')].find(b => b.textContent === 'Try a page that reads') as HTMLElement).click()
    await settle()
    expect((new window.FormData($('play-form') as never)).get('url')).toBe('https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview')
    expect((await run({ ...elsewhere, warnings: [], readiness: { state: 'ready', basis: [] }, evidenceRecord: { ...record, finalUrl: 'https://docs.example/a' } })).$('play-help').hidden).toBe(true)
  })
})

describe('the account menu and the credit bars', () => {
  it('lists the account\'s places and the docs under the avatar, opens and closes from the keyboard', async () => {
    const { $, window } = await page('/dashboard/', '', OCTOBER.now, octoberAnswers())
    expect($('me-initials').textContent).toBe('RE')
    expect($('side-email').textContent).toBe('reader@example.com')
    const menu = $('me-menu')
    const items = () => [...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent)
    expect(items()).toEqual(['#Settings', '%Usage', '*API keys', '¶Documentation', '±Changelog', '<>GitHub↗', '<-Sign out'])
    expect([...menu.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['/dashboard/settings/', '/dashboard/usage/', '/dashboard/keys/', '/docs/', '/changelog/', 'https://github.com/77777R7/Octocrawl'])
    expect(menu.querySelector('form')!.getAttribute('action')).toBe('/auth/logout')
    expect(menu.hidden).toBe(true)
    $('me-button').click()
    expect([menu.hidden, $('me-button').getAttribute('aria-expanded'), window.document.activeElement?.textContent]).toEqual([false, 'true', '#Settings'])
    menu.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }) as unknown as Event)
    expect(window.document.activeElement?.textContent).toBe('<-Sign out')
    menu.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event)
    expect([menu.hidden, window.document.activeElement?.id]).toEqual([true, 'me-button'])
    // A click elsewhere closes it too.
    $('me-button').click()
    window.document.body.click()
    expect(menu.hidden).toBe(true)
  })

  it('groups API keys, Connect and Settings under Account, and draws credits as solid bars', async () => {
    const { $, window } = await page('/dashboard/usage/', '', OCTOBER.now, octoberAnswers())
    const nav = [...window.document.querySelectorAll('.dash-nav > *')].map(element => element.textContent)
    expect(nav.slice(nav.indexOf('Account'))).toEqual(['Account', 'API keys', 'Connect', 'Settings'])
    for (const id of ['side-meter', 'sum-meter']) {
      const bar = $(id) as HTMLProgressElement
      expect([bar.tagName, bar.value, bar.max]).toEqual(['PROGRESS', 988, 1000])
    }
  })
})

describe('Usage', () => {
  const lines = () => [
    line('2026-10-20T11:55:00.000Z', KEY_A, 1), line('2026-10-20T03:10:00.000Z', KEY_A, 5),
    { ...line('2026-10-19T03:20:00.000Z', 'playground:u1', 0), status: 'blocked', httpStatus: 403, kind: 'unread', sha256: null },
    { ...line('2026-10-18T09:00:00.000Z', KEY_B, 1), status: 'failed', httpStatus: 404, kind: 'not_found' },
    { ...line('2026-10-17T09:00:00.000Z', 'playground:u1', 1), endpoint: 'map', httpStatus: null, lane: null, links: 20, kind: 'map', status: 'completed' },
  ]
  it('sets By site and By key side by side as treemaps of the same height', async () => {
    const { $ } = await page('/dashboard/usage/', '', OCTOBER.now, octoberAnswers(lines()), { width: 640 })
    for (const id of ['site-map', 'key-map']) expect($(id).querySelector('svg')!.getAttribute('height')).toBe('300')
    expect([...$('key-map').querySelectorAll('.tile-name')].map(name => name.textContent)).toEqual(['laptop agent (oc_7fQ2…)', 'Playground', 'ci (oc_Kd91…)'])
  })

  it('keeps every treemap label inside its tile, and draws Other last, in grey, in the bottom-right corner', async () => {
    // Fifteen sites: twelve get a tile, three go into Other. Each site's credits are its number of 1-credit lines.
    const hosts = ['www.a-very-long-hostname-for-one-site.example', ...Array.from({ length: 14 }, (_, i) => `site-${i}.example`)]
    const shown = hosts.flatMap((name, i) => Array.from({ length: i ? 16 - i : 30 }, () => ({ ...line('2026-10-20T11:00:00.000Z', KEY_A, 1), url: `https://${name}/a` })))
    const { window, $ } = await page('/dashboard/usage/', '', OCTOBER.now, octoberAnswers(shown), { width: 640 })
    const tiles = [...$('site-map').querySelectorAll('.tile')]
    expect(tiles).toHaveLength(13)
    for (const tile of tiles) {
      const room = Number(tile.querySelector('rect')!.getAttribute('width')) - 18
      // A window without layout measures nothing, so the chart counts 7 px a character, as here.
      for (const text of tile.querySelectorAll('text')) expect([text.textContent, text.textContent!.length * 7 <= room]).toEqual([text.textContent, true])
      if (tile.querySelector('.tile-value')) expect(tile.querySelector('.tile-name')).not.toBeNull()
    }
    expect(tiles[0]!.querySelector('.tile-name')!.textContent).toMatch(/^a-very-long-hostname[^…]*…$/)
    const other = tiles[tiles.length - 1]!
    expect(other.getAttribute('class')).toBe('tile other')
    const rect = other.querySelector('rect')!
    expect([Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')), Number(rect.getAttribute('y')) + Number(rect.getAttribute('height'))].map(Math.round)).toEqual([639, 299])
    other.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true }) as unknown as Event)
    const tip = window.document.querySelector('.glass-tip')!
    expect(tip.querySelector('.glass-tip-title')!.textContent).toBe('Other (3 sites)')
    expect([...tip.querySelectorAll('dt')].map(term => term.textContent)).toEqual(['Credits', 'Share', 'Calls', 'Not charged'])
  })

  it('counts results, HTTP status, lanes and hours from the request lines', async () => {
    const { $ } = await page('/dashboard/usage/', '', OCTOBER.now, octoberAnswers(lines()), { width: 640 })
    const list = (id: string) => [...$(id).querySelectorAll('li p')].map(row => row.textContent)
    expect(list('results-list')).toEqual(['Read2 · 40%', 'Blocked by the site1 · 20%', 'Not found1 · 20%', 'Map: URLs found1 · 20%'])
    expect(list('codes-list')).toEqual(['2002 · 50%', '4031 · 25%', '4041 · 25%'])
    expect(list('lanes-list')).toEqual(['HTTP1 · 50% · 1 credits', 'Browser1 · 50% · 5 credits'])
    const share = $('results-list').querySelector('progress') as HTMLProgressElement
    expect([share.value, share.max]).toEqual([2, 5])
    // One bar for each UTC hour with calls: 03 (two), 09 (two) and 11 (one).
    const bars = [...$('hours-chart').querySelectorAll('rect.bar')].map(bar => Number(bar.getAttribute('height')))
    expect(bars).toHaveLength(3)
    expect(bars[0]).toBe(bars[1])
    expect(bars[2]).toBeLessThan(bars[0]!)
    expect($('hours-empty').hidden).toBe(true)
    expect($('results-list').closest('.panel')!.querySelector('.lines-note')!.textContent).toBe('calls, from request lines')
  })

  it('shows a job as one row on Activity and counts its pages by outcome on Usage', async () => {
    const job = (endpoint: string, url: string, status: string, summary: Record<string, unknown>, reason: string | null = null) => ({ ...line('2026-10-20T11:30:00.000Z', KEY_A, 3), endpoint, url, status, reason, kind: 'job', httpStatus: null, lane: null, formats: null, robots: null, sha256: null, ms: 42_000, job: summary })
    const batch = job('batch', 'https://www.klockner.es/', 'completed', { id: 'job-1', requested: 12, pages: 12, errors: 9, outcomes: { read: 3, robots_unreachable: 9 } })
    const crawl = job('crawl', 'https://docs.example.org/', 'completed', { id: 'job-2', requested: 1, pages: 40, errors: 0, outcomes: { read: 40 } })
    const stopped = job('crawl', 'https://example.net/', 'failed', { id: 'job-3', requested: 1, pages: 0, errors: 0, outcomes: {} }, 'no_progress')
    const answers = octoberAnswers([...lines(), batch, crawl, stopped])
    const { $ } = await page('/dashboard/activity/', '', OCTOBER.now, answers)
    const rows = rowsOf($('activity-body'))
    const shown = rows.filter((row) => row[1] === '/batch' || row[1] === '/crawl').map((row) => row.slice(1, 9))
    expect(shown).toEqual([
      ['/batch', 'www.klockner.es/ + 11 more', '—', '—', '12 pages · 9 not read', '9 unreachable', '42 s', '3'],
      ['/crawl', 'docs.example.org/', '—', '—', '40 pages', '—', '42 s', '3'],
      ['/crawl', 'example.net/', '—', '—', 'failed · no_progress', '—', '42 s', '3'],
    ])
    const usage = await page('/dashboard/usage/', '', OCTOBER.now, answers)
    const list = (id: string) => [...usage.$(id).querySelectorAll('li p')].map(row => row.textContent)
    expect(list('results-list')).toEqual(['Read45 · 79%', 'robots.txt not readable9 · 16%', 'Blocked by the site1 · 2%', 'Not found1 · 2%', 'Map: URLs found1 · 2%'])
    // Read of what was answered, page by page: 3 of 5 calls and 43 of 52 job pages.
    expect(usage.$('sum-rate').textContent).toBe('81%')
    expect(usage.$('sum-rate-sub').textContent).toBe('57 calls in 30 days')
    const csv = await page('/dashboard/activity/', '', OCTOBER.now, answers)
    let saved: unknown = null
    ;(csv.window as unknown as { URL: { createObjectURL: (blob: unknown) => string; revokeObjectURL: () => void } }).URL.createObjectURL = (blob) => { saved = blob; return 'blob:x' }
    ;(csv.window as unknown as { URL: { revokeObjectURL: () => void } }).URL.revokeObjectURL = () => {}
    csv.$('export-csv').click()
    const text = await (saved as Blob).text()
    expect(text.split('\n')[0]).toContain(',jobId,pages,errors')
    expect(text).toContain('job-1,12,9')
  })

  it('counts a job\'s duplicates neither as read nor as failed, and calls a page no outcome read not read', async () => {
    const job = (id: string, summary: Record<string, unknown>) => ({ ...line('2026-10-20T11:30:00.000Z', KEY_A, 2), id, endpoint: 'crawl', url: 'https://docs.example.org/', status: 'completed', kind: 'job', httpStatus: null, lane: null, formats: null, robots: null, sha256: null, job: { requested: 1, ...summary } })
    const answers = octoberAnswers([job('a', { id: 'job-1', pages: 4, errors: 0, outcomes: { read: 2, duplicate: 2 } }), job('b', { id: 'job-2', pages: 3, errors: 0, outcomes: { read: 2, failed: 1 } })])
    const { $ } = await page('/dashboard/activity/', '', OCTOBER.now, answers)
    expect(rowsOf($('activity-body')).map((row) => row[5])).toEqual(['4 pages', '3 pages · 1 not read'])
    const usage = await page('/dashboard/usage/', '', OCTOBER.now, answers)
    expect([...usage.$('results-list').querySelectorAll('li p')].map(row => row.textContent)).toEqual(['Read4 · 57%', 'Duplicate of another page2 · 29%', 'Failed1 · 14%'])
    expect(usage.$('sum-rate').textContent).toBe('80%')
    expect(usage.$('sum-rate-sub').textContent).toBe('5 calls in 30 days')
  })

  it('keeps a batch\'s credits apart from the site of its first URL', async () => {
    const batch = { ...line('2026-10-20T11:30:00.000Z', KEY_A, 7), endpoint: 'batch', url: 'https://www.klockner.es/', status: 'completed', kind: 'job', job: { id: 'job-1', requested: 12, pages: 12, errors: 0, outcomes: { read: 12 } } }
    const { $ } = await page('/dashboard/usage/', '', OCTOBER.now, octoberAnswers([...lines(), batch]), { width: 640 })
    expect($('site-map').textContent).toContain('Batches')
    expect($('site-map').textContent).not.toContain('klockner')
  })

  it('tells a call that was never sent from one that got no answer', async () => {
    const shown = [
      { ...line('2026-10-20T11:00:00.000Z', KEY_A, 0), status: 'failed', httpStatus: null, robots: 'disallowed', kind: 'unread', sha256: null },
      { ...line('2026-10-20T10:00:00.000Z', KEY_A, 0), status: 'invalid_request', httpStatus: null, robots: null, kind: 'unread', sha256: null },
      { ...line('2026-10-20T09:00:00.000Z', KEY_A, 0), status: 'failed', reason: 'timeout', httpStatus: null, kind: 'unread', sha256: null },
      // robots.txt that could not be read: the page was not requested either, but no rule kept it out.
      { ...line('2026-10-20T08:00:00.000Z', KEY_A, 0), status: 'failed', reason: 'policy_denied', httpStatus: null, robots: 'unreachable', kind: 'unread', sha256: null },
    ]
    const { $ } = await page('/dashboard/usage/', '', OCTOBER.now, octoberAnswers(shown))
    expect([...$('codes-list').querySelectorAll('li p')].map(row => row.textContent)).toEqual(['Not requested3 · 75%', 'No response1 · 25%'])
    expect([...$('results-list').querySelectorAll('li p')].map(row => row.textContent)).toEqual(['Kept out by robots.txt1 · 25%', 'Invalid request1 · 25%', 'Timed out1 · 25%', 'robots.txt not readable1 · 25%'])
  })

  it('decodes the menu back to its own words even when it is reopened mid-decode', async () => {
    const { $, window } = await page('/dashboard/', '', OCTOBER.now, octoberAnswers())
    ;(window as unknown as { matchMedia: unknown }).matchMedia = (media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })
    for (let i = 0; i < 3; i++) { $('me-button').click(); await new Promise(resolve => setTimeout(resolve, 40)) }
    // Every decode the page started has run to its end.
    await window.happyDOM.waitUntilComplete()
    expect([...$('me-menu').querySelectorAll('.dash-menu-glyph')].map(glyph => glyph.textContent)).toEqual(['#', '%', '*', '¶', '±', '<>', '<-'])
    expect($('me-menu').querySelector('.dash-menu-kicker')!.textContent).toBe('Account')
  })

  it('says when the counts come from only the latest lines', async () => {
    const shown = lines()
    const { $ } = await page('/dashboard/usage/', '', OCTOBER.now, { ...octoberAnswers(shown), 'GET /api/account/activity': [200, { requests: shown, limit: 5, retentionDays: 30 }] })
    expect($('results-list').closest('.panel')!.querySelector('.lines-note')!.textContent).toBe('calls, from the latest 5 request lines')
  })
})

describe('Receipts and Activity show the format and the duration', () => {
  const runs = () => [
    { ...line('2026-10-20T11:55:00.000Z', 'playground:u1', 1), url: 'https://shop.example/a', finalUrl: 'https://shop.example/b', formats: ['markdown', 'links', 'json'], ms: 1834 },
    { ...line('2026-10-20T11:00:00.000Z', 'playground:u1', 1), endpoint: 'map', httpStatus: null, lane: null, robots: null, sha256: null, links: 20, kind: 'map', status: 'completed', formats: null, ms: 640 },
    { ...line('2026-10-20T10:00:00.000Z', 'playground:u1', 5), formats: [], ms: 912 },
    line('2026-10-11T10:00:00.000Z', 'playground:u1', 1),
  ]
  it('writes each receipt\'s result in words, its format, lane, duration and redirect, and "not recorded" for old lines', async () => {
    const { $ } = await page('/dashboard/scrape/', '', OCTOBER.now, octoberAnswers(runs()))
    const receipts = [...$('run-cards').querySelectorAll('.receipt')]
    const facts = (receipt: Element) => Object.fromEntries([...receipt.querySelectorAll('dt')].map(term => [term.textContent, term.nextElementSibling!.textContent]))
    expect(facts(receipts[0]!)).toEqual({ result: '200 · read', format: 'markdown + links + json', lane: 'HTTP', 'robots.txt': 'allowed', duration: '1.8 s', credits: '1', 'at (UTC)': 'Oct 20 11:55' })
    expect(receipts[0]!.querySelector('.receipt-final')!.textContent).toBe('→ shop.example/b')
    expect(receipts[0]!.querySelector('.receipt-hash span')!.textContent).toBe(`sha256 ${'f'.repeat(12)}…${'f'.repeat(8)}`)
    expect((receipts[0]!.querySelector('[data-hash]') as HTMLElement).dataset.hash).toBe('f'.repeat(64))
    // A map has no format; a scrape that named none used the default; an old line kept neither.
    expect(facts(receipts[1]!)).toMatchObject({ result: '20 links', lane: '—', duration: '640 ms' })
    expect(Object.keys(facts(receipts[1]!))).not.toContain('format')
    expect(facts(receipts[2]!)).toMatchObject({ format: 'default', lane: 'Browser', duration: '912 ms' })
    expect(facts(receipts[3]!)).toMatchObject({ format: 'not recorded', duration: 'not recorded' })
    expect(receipts[3]!.querySelector('dd.unknown')).not.toBeNull()
    expect(receipts[1]!.querySelector('.receipt-final')).toBeNull()
  })

  it('adds Format and Duration columns to Activity, and shows times in this computer\'s zone when Settings asks', async () => {
    const { $, window } = await page('/dashboard/activity/', '', OCTOBER.now, octoberAnswers(runs()), { stored: { 'octocrawl.dashboard.prefs': JSON.stringify({ tz: 'local' }) } })
    const heads = [...window.document.querySelectorAll('#main-content thead th')].map(head => head.textContent)
    expect(heads).toEqual(['Time (local)', 'Endpoint', 'URL', 'Format', 'Lane', 'Result', 'robots.txt', 'Duration', 'Credits', 'Evidence'])
    expect(rowsOf($('activity-body'))[0]!.slice(3, 8)).toEqual(['markdown + links + json', 'HTTP', '200', 'allowed', '1.8 s'])
    expect(rowsOf($('activity-body'))[0]![0]).toBe(new Date('2026-10-20T11:55:00.000Z').toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
  })
})

describe('Settings', () => {
  it('shows the profile and the plan, and keeps preferences in this browser', async () => {
    const { $, window } = await page('/dashboard/settings/', '', OCTOBER.now, octoberAnswers())
    expect([$('acct-email').textContent, $('acct-providers').textContent, $('acct-plan').textContent, $('acct-bought').textContent]).toEqual(['reader@example.com', 'GitHub', 'Free: 1,000 credits a month', 'None: credit packs are not sold yet'])
    const select = $('pref-view') as HTMLSelectElement
    expect(select.value).toBe('markdown')
    select.value = 'links'
    select.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event)
    expect(JSON.parse(window.localStorage.getItem('octocrawl.dashboard.prefs')!)).toEqual({ view: 'links', scope: 'main', tz: 'utc' })
    expect($('prefs-note').textContent).toBe('Saved in this browser.')
  })

  it('starts deleting the account only once its own address is typed, and says why when it cannot', async () => {
    const { $, window, calls } = await page('/dashboard/settings/', '', OCTOBER.now, { ...octoberAnswers(), 'POST /auth/delete/start': [400, { error: 'confirm_mismatch' }] })
    const input = $('delete-confirm') as HTMLInputElement
    const button = $('delete-start') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    input.value = 'someone@example.com'
    input.dispatchEvent(new window.Event('input') as unknown as Event)
    expect(button.disabled).toBe(true)
    input.value = ' Reader@Example.com '
    input.dispatchEvent(new window.Event('input') as unknown as Event)
    expect(button.disabled).toBe(false)
    button.click()
    await settle()
    expect(calls.find(call => call.method === 'POST')).toEqual({ method: 'POST', path: '/auth/delete/start', body: { confirm: 'Reader@Example.com' } })
    expect($('dash-message').textContent).toBe('That is not this account\'s email address.')
  })

  it('says on Settings when a deletion did not finish, or another account signed in', async () => {
    const failed = await page('/dashboard/settings/', '?delete=failed', OCTOBER.now, octoberAnswers())
    expect(failed.$('dash-message').textContent).toMatch(/^Deleting the account did not finish, and some of its data may already be gone/)
    const other = await page('/dashboard/settings/', '?delete=other_account', OCTOBER.now, octoberAnswers())
    expect(other.$('dash-message').textContent).toMatch(/^You signed in as another account, so nothing was deleted/)
  })

  it('opens the Playground on the preferred format and scope, unless the home page handed over its own', async () => {
    const stored = { 'octocrawl.dashboard.prefs': JSON.stringify({ view: 'links', scope: 'whole', tz: 'nonsense' }) }
    const plain = await page('/dashboard/scrape/', '', OCTOBER.now, octoberAnswers(), { stored })
    const form = new plain.window.FormData(plain.$('play-form') as never)
    expect([form.get('view'), form.get('scope')]).toEqual(['links', 'whole'])
    const handed = await page('/dashboard/scrape/', '?url=https%3A%2F%2Fdocs.example%2F', OCTOBER.now, octoberAnswers(), { stored })
    const chosen = new handed.window.FormData(handed.$('play-form') as never)
    expect([chosen.get('view'), chosen.get('scope')]).toEqual(['markdown', 'main'])
  })
})

describe('the Jobs page', () => {
  const id = (n: number) => `6f1c2a4e-1b2c-4d3e-8f90-${String(n).padStart(12, '0')}`
  /** A job's status as GET /v1/jobs and GET /v1/{batches|crawl}/:id give it (hostedJobRoutes.ts, jobStatus). */
  const job = (n: number, kind: 'batch' | 'crawl', status: string, read: number, extra: Record<string, unknown> = {}) => ({
    taskId: id(n), kind, status, failureReason: null, budgetExceeded: null, pagesFetched: read, succeeded: read, failed: 0, errors: 0, completed: read,
    ...(kind === 'batch' ? { requested: 10, remaining: 10 - read } : {}), credits: { used: read, maxCredits: null },
    createdAt: `2026-10-20T0${n}:00:00.000Z`, finishedAt: ['completed', 'failed', 'cancelled'].includes(status) ? `2026-10-20T0${n}:30:00.000Z` : null,
    expiresAt: ['completed', 'failed', 'cancelled'].includes(status) ? '2026-10-27T00:00:00.000Z' : null, ...extra,
  })
  const listed = (items: unknown[], nextBefore: string | null = null) => [200, { items, nextBefore, hasMore: nextBefore !== null }] as [number, unknown]
  const rows = ($: Page['$']) => [...$('jobs-body').querySelectorAll('tr')]

  it('says jobs run on the account\'s credits, and how to start one from an MCP client, while the account has none', async () => {
    const { $ } = await page('/dashboard/jobs/', '', OCTOBER.now, octoberAnswers())
    expect($('jobs-empty').hidden).toBe(false)
    expect($('jobs-table').hidden).toBe(true)
    expect($('jobs-more').hidden).toBe(true)
    expect($('jobs-empty').textContent).toContain('run on this account\'s credits')
    expect($('jobs-empty').textContent).not.toContain('invite')
    expect($('jobs-empty').querySelector('a[href="/docs/connect-mcp/#crawl-and-batch-jobs"]')).not.toBeNull()
    expect($('dash-message').textContent).toBe('')
  })

  it('lists the jobs newest first with a solid bar for each, the export for a finished one, and loads more', async () => {
    const answers = {
      ...octoberAnswers(),
      'GET /api/account/jobs?limit=20': listed([
        job(5, 'crawl', 'running', 7),
        job(4, 'batch', 'queued', 0, { credits: { used: 0, maxCredits: 40 } }),
        job(3, 'batch', 'completed', 10, { failed: 2, webhook: { url: 'https://hooks.example/a', events: ['completed'], delivery: { state: 'delivered', attempts: 1, httpStatus: 200, error: null, at: '2026-10-20T03:30:01.000Z' } } }),
      ], id(3)),
      [`GET /api/account/jobs?limit=20&before=${id(3)}`]: listed([job(2, 'crawl', 'failed', 3, { failureReason: 'no_progress' }), job(1, 'crawl', 'expired', 4)]),
    }
    const { $, window } = await page('/dashboard/jobs/', '', OCTOBER.now, answers)
    const [crawl, queued, done] = rows($)
    const bar = (row: Element) => row.querySelector('progress') as unknown as HTMLProgressElement
    expect([...crawl!.querySelectorAll('td')].map(td => td.textContent)).toEqual([`Oct 20 05:00`, `Crawl ${id(5)}`, 'running', '7 pages', '7', '—', 'when it ends'])
    // A running crawl's total is not known: its bar has no value. A batch counts against its URLs.
    expect(bar(crawl!).hasAttribute('value')).toBe(false)
    expect([bar(queued!).value, bar(queued!).max]).toEqual([0, 10])
    expect([bar(done!).value, bar(done!).max, bar(done!).className]).toEqual([10, 10, 'credit-bar job-bar'])
    expect(queued!.querySelectorAll('td')[4]!.textContent).toBe('0 of 40')
    expect(done!.querySelectorAll('td')[3]!.textContent).toBe('10 of 10 URLs · 2 failed')
    expect(done!.querySelector('button')!.textContent).toBe('Export')
    expect(done!.querySelectorAll('td')[6]!.textContent).toBe('ExportWebhook delivered')
    expect($('jobs-count').textContent).toBe('3 jobs shown · 2 running or queued')
    expect($('jobs-more').hidden).toBe(false)
    $('jobs-more').click()
    await settle()
    const [, , , failed, gone] = rows($)
    expect(failed!.querySelectorAll('td')[2]!.textContent).toBe('failedno_progress')
    expect(bar(failed!).value).toBe(1)
    expect(gone!.querySelectorAll('td')[2]!.textContent).toBe('expired')
    expect(gone!.querySelector('button')).toBeNull()
    expect($('jobs-more').hidden).toBe(true)
    expect($('jobs-count').textContent).toBe('5 jobs · 2 running or queued')
    // No text bar anywhere: every bar is a <progress>.
    expect(window.document.body.textContent).not.toMatch(/\[[#=.\s]{4,}\]/)
  })

  it('reads a running job again until it ends, then stops', async () => {
    const answers: Record<string, [number, unknown]> = { ...octoberAnswers(), 'GET /api/account/jobs?limit=20': listed([job(3, 'batch', 'running', 2)]), [`GET /api/account/jobs/batches/${id(3)}`]: [200, job(3, 'batch', 'running', 6)] }
    answers['GET /api/account/jobs?limit=20'] = listed([job(3, 'batch', 'running', 2), job(2, 'crawl', 'completed', 9)])
    const { $, calls } = await page('/dashboard/jobs/', '', OCTOBER.now, answers, { maxTimeout: 1 })
    // The ended job's row, and its Export button, stay the same elements while the running job above it is drawn again.
    const ended = rows($)[1]!
    const polls = () => calls.filter(call => call.path === `/api/account/jobs/batches/${id(3)}`).length
    await vi.waitFor(() => expect((rows($)[0]!.querySelector('progress') as unknown as HTMLProgressElement).value).toBe(6))
    expect(polls()).toBeGreaterThan(0)
    expect(rows($)[1]).toBe(ended)
    answers[`GET /api/account/jobs/batches/${id(3)}`] = [200, job(3, 'batch', 'completed', 10)]
    await vi.waitFor(() => expect(rows($)[0]!.querySelector('button')?.textContent).toBe('Export'))
    const after = polls()
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(polls()).toBe(after)
    // A page with no running job reads nothing again.
    const still = await page('/dashboard/jobs/', '', OCTOBER.now, { ...octoberAnswers(), 'GET /api/account/jobs?limit=20': listed([job(3, 'batch', 'completed', 10)]) }, { maxTimeout: 1 })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(still.calls.filter(call => call.path.startsWith('/api/account/jobs/'))).toEqual([])
  })

  it('opens a finished job\'s export link, and says so when the job has not written it yet', async () => {
    const link = `https://storage.googleapis.com/octocrawl-jobs/w/ws_u/jobs/${id(3)}/export.jsonl.gz?X-Goog-Signature=abc`
    const answers: Record<string, [number, unknown]> = { ...octoberAnswers(), 'GET /api/account/jobs?limit=20': listed([job(3, 'batch', 'completed', 10)]), [`GET /api/account/jobs/${id(3)}/export`]: [409, { code: 'job_running' }] }
    const { $, window } = await page('/dashboard/jobs/', '', OCTOBER.now, answers)
    const opened: string[] = []
    Object.defineProperty(window.location, 'assign', { configurable: true, value: (url: string) => { opened.push(url) } })
    const button = () => rows($)[0]!.querySelector('button') as unknown as HTMLButtonElement
    button().click()
    await settle()
    expect([opened, $('dash-message').textContent, button().disabled]).toEqual([[], 'This job has not finished writing its export. Try again in a minute.', false])
    answers[`GET /api/account/jobs/${id(3)}/export`] = [200, { url: link, expiresInSeconds: 900 }]
    button().click()
    await settle()
    expect(opened).toEqual([link])
  })
})

describe('the first five minutes explain themselves (2026-11-05 audit)', () => {
  it('names bought credits beside the month\'s grant, and the Overview\'s MCP line is the sign-in URL', async () => {
    const bought = { ...account(OCTOBER.resetsAt, usageOf(octoberLines())), credits: { remaining: 2382, monthly: { left: 988, of: 1000, resetsAt: OCTOBER.resetsAt }, purchased: 1394 } }
    const { $ } = await page('/dashboard/', '', OCTOBER.now, { ...octoberAnswers(), 'GET /api/account': [200, bought] })
    expect($('side-credits').textContent).toBe('2,382')
    expect($('side-renews').textContent).toBe('of 1,000 this month + 1,394 bought · renews Nov 1 (UTC)')
    expect($('ov-mcp').textContent).toBe('https://mcp.octocrawl.dev/mcp-oauth')
    expect($('kpi-left').closest('.kpi')!.textContent).toContain('1 per page over HTTP · 5 per page in a browser · 0 when blocked or kept out')
    expect([...$('ev-title').closest('.ev-copy')!.querySelectorAll('a')].map(a => a.textContent!.trim())).toEqual(['Try a page →', 'Connect your agent →', 'What a record holds'])
  })

  it('says on API keys what a key is for and where an agent goes instead, on both empty lists', async () => {
    const none = { ...account(OCTOBER.resetsAt, usageOf(octoberLines())), keys: [] }
    const { $, window } = await page('/dashboard/keys/', '', OCTOBER.now, { ...octoberAnswers(), 'GET /api/account': [200, none], 'GET /api/account/connections': [200, { connections: [] }] })
    expect(window.document.querySelector('#keys-title + span + p, #keys-title')!.closest('section')!.querySelector('p')!.textContent).toContain('1,000 credits a month instead of the keyless 20 pages a day')
    expect($('keys-empty').hidden).toBe(false)
    expect($('keys-empty').querySelector('a')!.getAttribute('href')).toBe('/dashboard/connect/')
    expect($('connections-empty').querySelector('a')!.getAttribute('href')).toBe('/dashboard/connect/')
    expect([...window.document.querySelectorAll('th')].map(th => th.textContent)).toContain('Sends you back to')
  })

  it('tells Connect\'s local section as two steps, and the Playground what the cost chip means', async () => {
    const connect = await page('/dashboard/connect/', '', OCTOBER.now, octoberAnswers())
    expect(connect.$('c-local-code').textContent).toBe('npx octocrawl serve')
    expect(connect.$('c-local-claude').textContent).toBe('claude mcp add octocrawl -- npx -y @octocrawl/mcp')
    expect(connect.$('c-local').closest('section')!.textContent).toContain('Needs Node.js 22.13 or later')
    expect(connect.$('agents-title').closest('section')!.textContent).toContain('claude mcp remove octocrawl')
    const play = await page('/dashboard/scrape/', '', OCTOBER.now, octoberAnswers())
    expect(play.$('play-summary').textContent).toBe('A page read over HTTP costs 1 credit, one that needs a browser 5, and one that is blocked or kept out by robots.txt nothing.')
    const map = await page('/dashboard/map/', '', OCTOBER.now, octoberAnswers())
    expect(map.$('play-summary').textContent).toBe('A map that finds URLs costs 1 credit; one that finds none costs nothing.')
  })
})
