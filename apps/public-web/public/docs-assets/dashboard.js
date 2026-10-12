// The dashboard's pages (scripts/build-docs.mjs). They read GET /api/account and GET /api/account/activity, and make
// and revoke keys through /api/account/keys (packages/public-preview account.ts); without a session they send the visitor to sign in. Text
// goes in with textContent only, and charts are text, as the site's CSP allows no inline style.
(() => {
  const $ = (id) => document.getElementById(id)
  const number = (n) => Number(n).toLocaleString('en-US')
  const day = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '')
  const longDay = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const set = (id, text) => { const element = $(id); if (element) element.textContent = text }
  const message = $('dash-message')
  const say = (text, error = false) => { message.textContent = text; message.classList.toggle('is-error', error) }
  const PROVIDERS = { 'google.com': 'Google', 'github.com': 'GitHub', emailLink: 'Email link' }

  /** `[########............]`: the filled part in the accent, the rest dim. */
  const meter = (element, part, whole, cells = 20) => {
    if (!element) return
    const full = whole > 0 ? Math.max(0, Math.min(cells, Math.round((part / whole) * cells))) : 0
    const rest = document.createElement('span')
    rest.className = 'rest'
    rest.textContent = '.'.repeat(cells - full)
    element.replaceChildren(`[${'#'.repeat(full)}`, rest, ']')
  }

  /** The last 30 UTC days, oldest first, with the days the API has no record of as zero. */
  const lastDays = (usage) => {
    const byDay = new Map(usage.map((d) => [d.day, d]))
    const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
    return Array.from({ length: 30 }, (_, i) => {
      const key = new Date(today - (29 - i) * 86_400_000).toISOString().slice(0, 10)
      return byDay.get(key) ?? { day: key, http: 0, browser: 0, notFound: 0, map: 0, unread: 0, credits: 0 }
    })
  }

  /** A stacked column of glyphs per day: # HTTP pages, % browser pages (5 each), + maps and 404s, to one scale. */
  const chart = (element, days) => {
    if (!element) return
    const rows = Number(element.dataset.rows) || 9
    const parts = days.map((d) => [d.http, d.http + d.browser * 5, d.http + d.browser * 5 + d.notFound + d.map])
    const max = Math.max(1, ...parts.map((p) => p[2]))
    const height = (v) => (v > 0 ? Math.max(1, Math.round((v / max) * rows)) : 0)
    const heights = parts.map((p) => p.map(height))
    const width = String(max).length
    const lines = []
    for (let r = rows; r >= 1; r--) {
      const label = r === rows ? String(max) : r === Math.ceil(rows / 2) ? String(Math.round(max / 2)) : ''
      const scale = document.createElement('span')
      scale.className = 'axis'
      scale.textContent = `${label.padStart(width)} ┤`
      const line = [scale]
      for (const [http, browser, all] of heights) {
        const glyph = r <= http ? ['#', 'g-http'] : r <= browser ? ['%', 'g-browser'] : r <= all ? ['+', 'g-other'] : null
        if (glyph) { const span = document.createElement('span'); span.className = glyph[1]; span.textContent = glyph[0]; line.push(span, ' ') } else line.push('  ')
      }
      lines.push(line)
    }
    const axis = document.createElement('span')
    axis.className = 'axis'
    const first = longDay(days[0].day)
    axis.textContent = `${'0'.padStart(width)} └${'─'.repeat(days.length * 2)}\n${' '.repeat(width + 3)}${first}${' '.repeat(Math.max(1, days.length * 2 - first.length - 5))}today`
    element.replaceChildren(...lines.flatMap((line) => [...line, '\n']), axis)
    const total = days.reduce((sum, d) => sum + d.credits, 0)
    set('chart-summary', `${number(total)} credits in the last 30 days; the busiest day used ${number(max)}.`)
  }

  const renderKeys = (keys, load) => {
    const mini = $('keys-mini')
    if (mini) {
      const active = keys.filter((k) => k.enabled).slice(0, 3)
      mini.replaceChildren(...active.map((k) => {
        const item = document.createElement('li')
        const name = document.createElement('span'); name.textContent = k.label
        const prefix = document.createElement('code'); prefix.textContent = `${k.prefix}…`
        item.append(name, prefix)
        return item
      }))
      $('keys-mini-empty').hidden = active.length > 0
    }
    const body = $('keys-body')
    if (!body) return
    body.replaceChildren(...keys.map((key) => {
      const row = document.createElement('tr')
      const cells = [[key.label], [`${key.prefix}…`, 'code'], [day(key.createdAt)]]
      for (const [text, tag] of cells) {
        const cell = document.createElement('td')
        if (tag) { const code = document.createElement(tag); code.textContent = text; cell.append(code) } else cell.textContent = text
        row.append(cell)
      }
      const status = document.createElement('td')
      const pill = document.createElement('span'); pill.className = `status ${key.enabled ? 'on' : 'off'}`; pill.textContent = key.enabled ? 'Active' : 'Revoked'
      status.append(pill)
      const action = document.createElement('td')
      if (key.enabled) {
        const button = document.createElement('button')
        button.type = 'button'; button.className = 'button quiet'; button.textContent = 'Revoke'
        let armed = false
        button.addEventListener('click', async () => {
          if (!armed) { armed = true; button.textContent = 'Click again to revoke'; setTimeout(() => { armed = false; button.textContent = 'Revoke' }, 4000); return }
          button.disabled = true
          const response = await fetch(`/api/account/keys/${key.id}/revoke`, { method: 'POST', credentials: 'same-origin' }).catch(() => null)
          if (response && response.status === 204) { say(`Revoked ${key.label}. It stops working within a minute.`); load() } else { button.disabled = false; say('The key could not be revoked. Try again.', true) }
        })
        action.append(button)
      }
      row.append(status, action)
      return row
    }))
    $('keys-empty').hidden = keys.length > 0
  }

  const renderUsage = (days, usage) => {
    const body = $('usage-body')
    if (!body) return
    const rows = usage.slice().reverse()
    const fields = ['http', 'browser', 'notFound', 'map', 'unread', 'credits']
    body.replaceChildren(...rows.map((d) => {
      const row = document.createElement('tr')
      const first = document.createElement('td'); first.textContent = d.day; row.append(first)
      for (const field of fields) { const cell = document.createElement('td'); cell.className = 'num'; cell.textContent = number(d[field]); row.append(cell) }
      return row
    }))
    const totals = document.createElement('tr')
    const label = document.createElement('td'); label.textContent = '30 days'; totals.append(label)
    for (const field of fields) { const cell = document.createElement('td'); cell.className = 'num'; cell.textContent = number(days.reduce((sum, d) => sum + d[field], 0)); totals.append(cell) }
    $('usage-foot').replaceChildren(...(rows.length ? [totals] : []))
    $('usage-empty').hidden = rows.length > 0
    set('usage-total', `${number(days.reduce((sum, d) => sum + d.credits, 0))} credits in 30 days`)
  }

  const READ = new Set(['success', 'partial', 'empty_verified'])
  const host = (url) => { try { return new URL(url).host } catch { return url || '(no URL)' } }
  const timeOf = (iso) => (iso ? `${longDay(iso)} ${iso.slice(11, 16)}` : '')
  /** What a request line shows as its result, and how it is marked: read, not charged, or failed. */
  const outcome = (line) => {
    if (line.endpoint === 'map') return line.links !== null && line.links > 0 ? [`${number(line.links)} links`, 'ok'] : [line.status === 'invalid_request' ? 'invalid request' : 'no links', 'warn']
    if (READ.has(line.status)) return [line.httpStatus ? `${line.httpStatus}` : line.status, 'ok']
    if (line.status === 'failed' && (line.httpStatus === 404 || line.httpStatus === 410)) return [`${line.httpStatus}`, 'warn']
    if (line.status === 'invalid_request') return ['invalid request', 'warn']
    return [line.reason ? `${line.status} · ${line.reason}` : line.status || 'error', 'bad']
  }
  const cell = (row, text, className = '') => { const td = document.createElement('td'); if (className) td.className = className; td.textContent = text; row.append(td); return td }
  const renderRequests = (id, lines, keyNames) => {
    const body = $(`${id}-body`)
    if (!body) return
    body.replaceChildren(...lines.map((line) => {
      const row = document.createElement('tr')
      cell(row, timeOf(line.at))
      cell(row, `/${line.endpoint}`)
      const url = cell(row, '', 'url')
      if (/^https?:\/\//.test(line.url)) {
        const link = document.createElement('a'); link.href = line.url; link.rel = 'noopener noreferrer'; link.target = '_blank'; link.textContent = line.url.replace(/^https?:\/\//, ''); link.title = line.url
        url.append(link)
      } else url.textContent = line.url || '(no URL)'
      cell(row, line.lane ?? '—')
      const [label, mark] = outcome(line)
      const result = cell(row, '')
      const pill = document.createElement('span'); pill.className = `status ${mark}`; pill.textContent = label; result.append(pill)
      cell(row, line.robots ?? '—')
      cell(row, number(line.credits), 'num')
      const hash = cell(row, line.sha256 ? `sha256 ${line.sha256.slice(0, 12)}…` : '—', 'hash')
      if (line.sha256) hash.title = line.sha256
      if (keyNames) row.title = `Key: ${keyNames.get(line.keyId) ?? 'a revoked or deleted key'}`
      return row
    }))
    $(`${id}-empty`).hidden = lines.length > 0
  }
  /** Rows of [name, calls, second figure, credits], largest credits first. */
  const tally = (lines, keyOf, second) => {
    const groups = new Map()
    for (const line of lines) {
      const key = keyOf(line)
      const group = groups.get(key) ?? [key, 0, 0, 0]
      group[1] += 1; group[2] += second(line) ? 1 : 0; group[3] += line.credits
      groups.set(key, group)
    }
    return [...groups.values()].sort((a, b) => b[3] - a[3] || b[1] - a[1])
  }
  const renderTally = (id, rows) => {
    const body = $(`${id}-body`)
    if (!body) return
    body.replaceChildren(...rows.map((values) => { const row = document.createElement('tr'); values.forEach((v, i) => cell(row, i === 0 ? v : number(v), i === 0 ? '' : 'num')); return row }))
    $(`${id}-empty`).hidden = rows.length > 0
  }
  const csvField = (value) => { const text = value === null || value === undefined ? '' : String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text }

  let activity = null
  let keyNames = new Map()
  const filters = $('activity-filters')
  const filtered = () => {
    if (!activity) return []
    const form = filters ? new FormData(filters) : new FormData()
    const search = String(form.get('search') ?? '').trim().toLowerCase()
    return activity.filter((line) => (!search || line.url.toLowerCase().includes(search))
      && (!form.get('endpoint') || line.endpoint === form.get('endpoint'))
      && (!form.get('key') || line.keyId === form.get('key'))
      && (form.get('result') !== 'read' || outcome(line)[1] === 'ok')
      && (form.get('result') !== 'free' || line.credits === 0))
  }
  const renderActivity = () => {
    if (!activity) return
    renderRequests('recent', activity.slice(0, 5))
    const shown = filtered()
    renderRequests('activity', shown, keyNames)
    set('activity-count', `${number(shown.length)} of ${number(activity.length)} in 30 days`)
    renderTally('by-key', tally(activity, (line) => keyNames.get(line.keyId) ?? 'Revoked or deleted key', (line) => outcome(line)[1] === 'ok' && line.endpoint === 'scrape'))
    renderTally('by-site', tally(activity, (line) => host(line.url), (line) => line.credits === 0).slice(0, 10))
  }
  if (filters) {
    filters.addEventListener('input', renderActivity)
    filters.addEventListener('submit', (event) => event.preventDefault())
    $('export-csv').addEventListener('click', () => {
      const columns = ['at', 'endpoint', 'url', 'finalUrl', 'lane', 'status', 'httpStatus', 'reason', 'robots', 'links', 'credits', 'sha256', 'keyId']
      const text = [columns.join(','), ...filtered().map((line) => columns.map((c) => csvField(line[c])).join(','))].join('\n')
      const link = document.createElement('a')
      link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
      link.download = `octocrawl-activity-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    })
  }
  const loadActivity = async () => {
    if (!$('recent-body') && !$('activity-body') && !$('by-key-body')) return
    try {
      const response = await fetch('/api/account/activity', { credentials: 'same-origin' })
      if (!response.ok) throw new Error(String(response.status))
      activity = (await response.json()).requests
      renderActivity()
    } catch { say('Your requests could not be loaded. Reload the page in a minute.', true) }
  }

  const render = (data, load) => {
    const { monthly } = data.credits
    const days = lastDays(data.usage)
    set('side-credits', number(data.credits.remaining))
    const bar = $('side-meter')
    if (bar) { bar.max = Math.max(1, monthly.of); bar.value = Math.max(0, Math.min(monthly.left, monthly.of)) }
    set('side-renews', `of ${number(monthly.of)} this month · renews ${longDay(monthly.resetsAt)} (UTC)`)
    set('side-email', data.email || 'your account')

    set('kpi-left', number(data.credits.remaining))
    meter($('kpi-meter'), monthly.left, monthly.of)
    set('kpi-used', number(Math.max(0, monthly.of - monthly.left)))
    set('kpi-used-sub', `of ${number(monthly.of)} free${data.credits.purchased ? `, plus ${number(data.credits.purchased)} bought` : ''}`)
    const http = days.reduce((sum, d) => sum + d.http, 0)
    const browser = days.reduce((sum, d) => sum + d.browser, 0)
    set('kpi-pages', number(http + browser))
    set('kpi-pages-sub', `${number(http)} HTTP · ${number(browser)} browser`)
    set('kpi-free', number(days.reduce((sum, d) => sum + d.unread, 0)))
    chart($('usage-chart'), days)
    renderUsage(days, data.usage)
    renderKeys(data.keys, load)
    keyNames = new Map(data.keys.map((k) => [k.id, `${k.label} (${k.prefix}…)`]))
    const keyFilter = $('f-key')
    if (keyFilter && keyFilter.options.length === 1) for (const key of data.keys) keyFilter.append(new Option(`${key.label} (${key.prefix}…)`, key.id))
    renderActivity()

    set('acct-email', data.email || 'No email address on record')
    const providers = $('acct-providers')
    if (providers) {
      const names = (data.providers || []).map((p) => PROVIDERS[p] || p)
      providers.replaceChildren(...(names.length ? names : ['Not recorded']).map((name) => { const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = name; return chip }))
    }
    set('acct-month', `${number(monthly.left)} of ${number(monthly.of)} free credits left, renewed on ${day(monthly.resetsAt)} (UTC)`)
    set('acct-bought', data.credits.purchased ? number(data.credits.purchased) : 'None')
  }

  const load = async () => {
    try {
      const response = await fetch('/api/account', { credentials: 'same-origin' })
      if (response.status === 401) { location.replace(`/signin/?next=${encodeURIComponent(location.pathname)}`); return }
      if (!response.ok) throw new Error(String(response.status))
      render(await response.json(), load)
      if (activity === null) loadActivity()
    } catch { say('Your dashboard could not be loaded. Reload the page in a minute.', true) }
  }

  // A sign-in that linked a provider lands here with ?linked=github (auth.ts).
  const linked = { github: 'GitHub', google: 'Google' }[new URLSearchParams(location.search).get('linked')]
  if (linked) { say(`${linked} is now linked to this account: you can sign in with it next time.`); history.replaceState(null, '', location.pathname) }

  for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.addEventListener('click', () => {
      for (const other of tab.parentElement.querySelectorAll('[role="tab"]')) {
        other.setAttribute('aria-selected', String(other === tab))
        $(other.dataset.tab).hidden = other !== tab
      }
    })
  }
  for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
      const source = $(button.dataset.copy)
      try { await navigator.clipboard.writeText(source.textContent); button.textContent = 'Copied'; setTimeout(() => { button.textContent = 'Copy' }, 1500) } catch { getSelection().selectAllChildren(source) }
    })
  }

  const form = $('key-form')
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const button = form.querySelector('button')
      button.disabled = true
      try {
        const response = await fetch('/api/account/keys', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: form.label.value }) })
        if (response.status === 201) {
          const { key } = await response.json()
          set('new-key', key)
          set('new-key-mcp', `claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp --header "Authorization: Bearer ${key}"`)
          $('key-reveal').hidden = false
          form.reset()
          load()
        } else if (response.status === 409) say('An account holds at most five active keys. Revoke one first.', true)
        else say('The key could not be created. Try again.', true)
      } catch { say('The key could not be created. Try again.', true) } finally { button.disabled = false }
    })
  }

  // A faint field of glyphs behind the page title. On the Overview (data-wave) it moves like a flag: the left edge is
  // held, and the field is read further up or down the further right a cell is, so the glyphs ripple in place on the
  // grid while the field keeps its shape. About 15 frames a second, paused in a hidden tab, still with reduced motion.
  const noise = $('dash-noise')
  if (noise) {
    const glyphs = ' .:-=+*#%'
    const COLS = 110
    const ROWS = 12
    const field = (x, y) => Math.abs(Math.sin(x * 0.19 + y * 0.8) * Math.cos(x * 0.045 - y * 0.35))
    const draw = (t) => {
      let text = ''
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const hold = (x / (COLS - 1)) ** 1.6
          const lift = t === null ? 0 : hold * (2.4 * Math.sin(x * 0.12 - t * 1.6) + 0.7 * Math.sin(x * 0.27 - t * 2.5 + y * 0.15))
          text += glyphs[Math.min(glyphs.length - 1, Math.floor(field(x, y - lift) * (glyphs.length - 1)))]
        }
        text += '\n'
      }
      noise.textContent = text
    }
    draw(null)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    if ('wave' in noise.dataset && !still.matches) {
      let last = 0
      const frame = (ms) => {
        if (!document.hidden && ms - last >= 66) { last = ms; draw(ms / 1000) }
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }
  }

  load()
})()
