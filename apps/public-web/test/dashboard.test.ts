import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it } from 'vitest'
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
interface Page { window: Window; $: (id: string) => HTMLElement; calls: Call[] }
const open: Window[] = []
afterEach(async () => { await Promise.all(open.splice(0).map(window => window.happyDOM.close())) })

/** A dashboard page at `now`, its API answering from `answers` (path → [status, body]). */
async function page(path: string, search: string, now: string, answers: Record<string, [number, unknown]>): Promise<Page> {
  const [, title, lead, body] = DASHBOARD_BODIES.find(([p]) => p === path)!
  const html = dashboardPageHtml(path, title, lead, body, new Proxy({}, { get: () => 'test' })).replace(/<script\b[^>]*><\/script>/g, '')
  const window = new Window({ url: `https://octocrawl.dev${path}${search}`, settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } })
  open.push(window)
  window.document.write(html)
  const calls: Call[] = []
  const scope = window as unknown as Record<string, unknown>
  scope.fetch = async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ method, path: url, body: init.body ? JSON.parse(init.body) : null })
    const [status, answer] = answers[`${method} ${url}`] ?? [404, { error: 'not_found' }]
    return { ok: status >= 200 && status < 300, status, json: async () => answer, headers: { get: () => null } }
  }
  // Still, as with reduced motion: no animation frames or timers left running.
  scope.matchMedia = (media: string) => ({ matches: true, media, addEventListener() {}, removeEventListener() {} })
  scope.Option = function Option(text: string, value: string) { const option = window.document.createElement('option'); option.textContent = text; option.value = value; return option }
  window.eval(`(() => { const Real = Date; const NOW = Date.parse(${JSON.stringify(now)}); window.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [NOW])) } static now() { return NOW } } })()`)
  for (const source of [SCRIPTS.charts, SCRIPTS.rules, SCRIPTS.dashboard]) window.eval(source)
  await settle()
  return { window, calls, $: (id: string) => window.document.getElementById(id) as unknown as HTMLElement }
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0)) }
const rowsOf = (body: HTMLElement) => [...body.querySelectorAll('tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent))

// October 2026: the request lines began on the 12th, so they do not reach the start of the month.
const OCTOBER = { now: '2026-10-20T12:00:00.000Z', resetsAt: '2026-11-01T00:00:00.000Z' }
const octoberLines = () => [line('2026-10-20T11:55:00.000Z', KEY_A, 1), line('2026-10-18T09:00:00.000Z', KEY_A, 5), line('2026-10-17T09:00:00.000Z', 'playground:u1', 1)]
const octoberAnswers = (lines = octoberLines(), usage = usageOf(lines)) => ({
  'GET /api/account': [200, account(OCTOBER.resetsAt, usage)] as [number, unknown],
  'GET /api/account/activity': [200, { requests: lines, limit: 1000, retentionDays: 30 }] as [number, unknown],
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

describe('Connect fills in a key', () => {
  const KEY = `oc_${'x'.repeat(43)}`
  const setups = (page: Page) => [...page.window.document.querySelectorAll('#main-content pre')].map(pre => pre.textContent ?? '')

  it('puts a pasted key in every setup that asks for one, and takes it out again', async () => {
    const connect = await page('/dashboard/connect/', '', OCTOBER.now, octoberAnswers())
    const before = setups(connect)
    const asking = before.filter(text => text.includes('oc_YOUR_KEY'))
    expect(asking.length).toBeGreaterThanOrEqual(6)
    const input = connect.$('fill-key') as HTMLInputElement
    input.value = KEY
    input.dispatchEvent(new connect.window.Event('input') as unknown as Event)
    const after = setups(connect)
    expect(after.filter(text => text.includes('oc_YOUR_KEY'))).toEqual([])
    expect(after.filter(text => text.includes(KEY))).toHaveLength(asking.length)
    expect(after).toContain(`claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp --header "Authorization: Bearer ${KEY}"`)
    expect(connect.$('fill-note').textContent).toBe('Every setup below carries oc_xxxx…')
    // Not a key: the setups go back to the placeholder, and the page says why.
    input.value = 'sk-something'
    input.dispatchEvent(new connect.window.Event('input') as unknown as Event)
    expect(setups(connect)).toEqual(before)
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
    expect(setups(connect).filter(text => text.includes(KEY)).length).toBeGreaterThanOrEqual(6)
    expect(connect.$('fill-note').textContent).toMatch(/^Made a key named Agent setup \(oc_xxxx…\)/)
  })

  it('says so when the account already holds five keys', async () => {
    const connect = await page('/dashboard/connect/', '', OCTOBER.now, { ...octoberAnswers(), 'POST /api/account/keys': [409, { error: 'too_many_keys', limit: 5 }] })
    connect.$('fill-create').click()
    await settle()
    expect(connect.$('dash-message').textContent).toBe('An account holds at most five active keys. Revoke one in API keys first.')
    expect(setups(connect).some(text => text.includes('oc_YOUR_KEY'))).toBe(true)
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
