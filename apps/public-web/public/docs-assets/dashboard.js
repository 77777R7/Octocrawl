// The dashboard's pages (scripts/build-docs.mjs). They read GET /api/account and GET /api/account/activity, and make
// and revoke keys through /api/account/keys, and the Playground runs through POST /api/account/run (packages/public-preview
// account.ts); without a session they send the visitor to sign in. Text
// goes in with textContent only; the charts are SVG from dashboard-charts.js (window.OctoCharts).
(() => {
  const $ = (id) => document.getElementById(id)
  const number = (n) => Number(n).toLocaleString('en-US')
  const day = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '')
  const longDay = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const set = (id, text) => { const element = $(id); if (element) element.textContent = text }
  // The sidebar's highlight is one block that follows the current page's link: when the Playground switches mode in place
  // it slides to the other link instead of jumping. Placed through CSSOM (transform, size), which the CSP allows.
  const nav = document.querySelector('.dash-nav')
  const mark = nav ? document.createElement('span') : null
  const placeMark = () => {
    const current = nav && nav.querySelector('a[aria-current="page"]')
    if (!mark || !current) return
    mark.style.width = `${current.offsetWidth}px`
    mark.style.height = `${current.offsetHeight}px`
    mark.style.transform = `translate(${current.offsetLeft}px, ${current.offsetTop}px)`
  }
  if (mark) {
    mark.className = 'dash-nav-mark'
    mark.setAttribute('aria-hidden', 'true')
    nav.prepend(mark)
    nav.classList.add('has-mark')
    placeMark()
    requestAnimationFrame(() => mark.classList.add('is-ready'))
    if ('ResizeObserver' in window) new ResizeObserver(placeMark).observe(nav)
  }
  const message = $('dash-message')
  const say = (text, error = false) => { message.textContent = text; message.classList.toggle('is-error', error) }
  const PROVIDERS = { 'google.com': 'Google', 'github.com': 'GitHub', emailLink: 'Email link' }

  /** A solid bar (a <progress>): value and max are properties, which the CSP allows. */
  const setBar = (id, part, whole) => { const bar = $(id); if (bar) { bar.max = Math.max(1, whole); bar.value = Math.max(0, Math.min(part, whole)) } }
  const charts = window.OctoCharts
  const shortDay = (key) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const longDate = (key) => new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  /** A faint, still field of glyphs for a chart's or a banner's background. */
  const glyphField = (element, cols, rows, seed = 0) => {
    if (!element) return
    const glyphs = ' .:-=+*#%'
    let text = ''
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) text += glyphs[Math.min(glyphs.length - 1, Math.floor(Math.abs(Math.sin(x * 0.17 + y * 0.7 + seed) * Math.cos(x * 0.05 - y * 0.31)) * (glyphs.length - 1)))]
      text += '\n'
    }
    element.textContent = text
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

  // Usage over time: one stacked bar per day, by kind or by endpoint, in credits or in calls.
  const usageView = { group: 'kind', measure: 'credits' }
  const SERIES = {
    kind: [['HTTP page', 'b-http', (d) => d.http, 1], ['Browser page', 'b-browser', (d) => d.browser, 5], ['Not found', 'b-404', (d) => d.notFound, 1], ['Map', 'b-map', (d) => d.map, 1], ['Not charged', 'b-free', (d) => d.unread, 0]],
    endpoint: [['/scrape', 'b-http', (d) => d.http + d.browser + d.notFound, null], ['/map', 'b-map', (d) => d.map, 1], ['Not charged', 'b-free', (d) => d.unread, 0]],
  }
  let usageDays = null
  const drawUsage = () => {
    const host = $('usage-bars')
    if (!host || !usageDays || !charts) return
    const credits = usageView.measure === 'credits'
    const series = SERIES[usageView.group]
      .filter(([, , , cost]) => !credits || cost !== 0)
      .map(([label, cls, count, cost]) => ({ label, cls, values: usageDays.map((d) => (credits ? (cost === null ? d.http + d.browser * 5 + d.notFound : count(d) * cost) : count(d))) }))
    const unit = credits ? 'credits' : 'calls'
    charts.bars(host, usageDays.map((d) => shortDay(d.day)), series, { height: 260, unit, label: `${unit} per UTC day, last 30 days`, title: (i) => longDate(usageDays[i].day) })
    const legend = $('usage-legend')
    legend.replaceChildren(...series.map((s) => { const item = document.createElement('span'); const dot = document.createElement('i'); dot.className = `sw ${s.cls}`; item.append(dot, s.label); return item }))
  }

  // Credits used, last 7 or 30 days: a line, with the total beside it.
  let usedRange = 7
  const drawUsed = () => {
    const host = $('used-chart')
    if (!host || !usageDays || !charts) return
    const days = usageDays.slice(-usedRange)
    const values = days.map((d) => d.credits)
    set('used-total', number(values.reduce((a, b) => a + b, 0)))
    set('used-range', `Last ${usedRange} days (UTC)`)
    charts.line(host, days.map((d) => shortDay(d.day)), values, {
      height: 230, label: `Credits used per UTC day, last ${usedRange} days`, title: (i) => longDate(days[i].day),
      rows: (i) => [['Credits', number(values[i]), 'b-http'], ['HTTP pages', number(days[i].http)], ['Browser pages', number(days[i].browser)], ['Maps', number(days[i].map)], ['Not charged', number(days[i].unread)]],
    })
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
      if (keyNames) row.title = `Key: ${keyName(line)}`
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
  const csvField = (value) => { const text = value === null || value === undefined ? '' : String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text }

  let activity = null
  let keyNames = new Map()
  /** The Playground's runs carry the key id `playground:{uid}` (hostedApi.ts, SITE_ACCOUNT_HEADER). */
  const fromPlayground = (line) => line.keyId.startsWith('playground:')
  const keyName = (line) => (fromPlayground(line) ? 'Playground' : keyNames.get(line.keyId) ?? 'Revoked or deleted key')
  const filters = $('activity-filters')
  const filtered = () => {
    if (!activity) return []
    const form = filters ? new FormData(filters) : new FormData()
    const search = String(form.get('search') ?? '').trim().toLowerCase()
    return activity.filter((line) => (!search || line.url.toLowerCase().includes(search))
      && (!form.get('endpoint') || line.endpoint === form.get('endpoint'))
      && (!form.get('key') || (form.get('key') === 'playground' ? fromPlayground(line) : line.keyId === form.get('key')))
      && (form.get('result') !== 'read' || outcome(line)[1] === 'ok')
      && (form.get('result') !== 'free' || line.credits === 0))
  }
  /** The Playground's recent runs as receipts: what was read, the result, robots.txt, the cost, when, and the hash. */
  let shownReceipts = null
  const renderRuns = (lines) => {
    const host = $('run-cards')
    if (!host) return
    host.replaceChildren(...lines.map((line) => {
      const receipt = document.createElement('article'); receipt.className = 'receipt'
      if (shownReceipts && !shownReceipts.has(line.id)) receipt.classList.add('is-new')
      const top = document.createElement('div'); top.className = 'receipt-top'
      const kind = document.createElement('span'); kind.textContent = line.endpoint
      const again = document.createElement('button'); again.type = 'button'; again.className = 'receipt-again'; again.dataset.again = line.url; again.dataset.endpoint = line.endpoint
      again.setAttribute('aria-label', `Run ${line.url} again`); again.textContent = 'again ↺'
      top.append(kind, again)
      const where = document.createElement('p'); where.className = 'receipt-url'; where.title = line.url
      try { const url = new URL(line.url); where.textContent = `${url.host}${url.pathname === '/' ? '' : url.pathname}` } catch { where.textContent = line.url || '(no URL)' }
      const facts = document.createElement('dl')
      const [label, mark] = outcome(line)
      for (const [name, value, className] of [['result', label, mark], ['lane', line.lane ?? '—'], ['robots.txt', line.robots ?? '—'], ['credits', number(line.credits)], ['at (UTC)', timeOf(line.at)]]) {
        const term = document.createElement('dt'); term.textContent = name
        const detail = document.createElement('dd'); detail.textContent = value; if (className) detail.className = className
        facts.append(term, detail)
      }
      const hash = document.createElement('p'); hash.className = 'receipt-hash'; hash.textContent = line.sha256 ? `sha256 ${line.sha256}` : 'nothing read: no hash'
      receipt.append(top, where, facts, hash)
      return receipt
    }))
    shownReceipts = new Set(lines.map((line) => line.id))
    $('runs-empty').hidden = lines.length > 0
  }
  const renderActivity = () => {
    if (!activity) return
    renderRequests('recent', activity.slice(0, 5))
    renderRuns(activity.filter(fromPlayground).slice(0, 6))
    const shown = filtered()
    renderRequests('activity', shown, keyNames)
    set('activity-count', `${number(shown.length)} of ${number(activity.length)} in 30 days`)
    // Read of the calls that had a result: an invalid request had none. Unknown (no lines yet) is a dash, not zero.
    const answered = activity.filter((line) => line.status !== 'invalid_request')
    set('sum-rate', answered.length ? `${Math.round((answered.filter((line) => outcome(line)[1] === 'ok').length / answered.length) * 100)}%` : '—')
    set('sum-rate-sub', answered.length ? `${number(answered.length)} calls in 30 days` : 'no request lines yet')
    const sites = tally(activity, (line) => host(line.url), (line) => line.credits === 0)
    const siteHost = $('site-map')
    if (siteHost && charts) {
      const top = sites.slice(0, 12)
      const rest = sites.slice(12)
      const items = top.map(([name, calls, free, credits]) => ({ name, value: credits, rows: [['Calls', number(calls)], ['Not charged', number(free)]] }))
      if (rest.length) items.push({ name: `Other (${rest.length} sites)`, value: rest.reduce((sum, r) => sum + r[3], 0), rows: [['Calls', number(rest.reduce((sum, r) => sum + r[1], 0))]] })
      const charged = items.some((item) => item.value > 0)
      if (charged) charts.treemap(siteHost, items, { unit: 'credits', label: 'Credits by site, last 30 days' }); else siteHost.replaceChildren()
      $('by-site-empty').hidden = charged
    }
    const keyList = $('by-key-list')
    if (keyList) {
      const keys = tally(activity, keyName, () => false)
      const total = keys.reduce((sum, k) => sum + k[3], 0)
      keyList.replaceChildren(...keys.map(([name, calls, , credits]) => {
        const item = document.createElement('li')
        const head = document.createElement('p')
        const label = document.createElement('span'); label.textContent = name
        const figure = document.createElement('span'); figure.className = 'mono'; figure.textContent = `${number(credits)} · ${total ? Math.round((credits / total) * 100) : 0}%`
        head.append(label, figure)
        const bar = document.createElement('progress'); bar.className = 'credit-bar'; bar.max = Math.max(1, total); bar.value = credits; bar.setAttribute('aria-label', `${name}: ${credits} credits, ${calls} calls`)
        const sub = document.createElement('p'); sub.className = 'dash-small'; sub.textContent = `${number(calls)} calls`
        item.append(head, bar, sub)
        return item
      }))
      $('by-key-empty').hidden = keys.length > 0
    }
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
    if (!$('recent-body') && !$('activity-body') && !$('by-key-list') && !$('run-cards')) return
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
    setBar('side-meter', monthly.left, monthly.of)
    set('side-renews', `of ${number(monthly.of)} this month · renews ${longDay(monthly.resetsAt)} (UTC)`)
    set('side-email', data.email || 'your account')

    set('kpi-left', number(data.credits.remaining))
    setBar('kpi-meter', monthly.left, monthly.of)
    set('kpi-used', number(Math.max(0, monthly.of - monthly.left)))
    set('kpi-used-sub', `of ${number(monthly.of)} free${data.credits.purchased ? `, plus ${number(data.credits.purchased)} bought` : ''}`)
    const http = days.reduce((sum, d) => sum + d.http, 0)
    const browser = days.reduce((sum, d) => sum + d.browser, 0)
    set('kpi-pages', number(http + browser))
    set('kpi-pages-sub', `${number(http)} HTTP · ${number(browser)} browser`)
    set('kpi-free', number(days.reduce((sum, d) => sum + d.unread, 0)))
    usageDays = days
    drawUsed()
    drawUsage()
    renderUsage(days, data.usage)
    set('sum-left', number(data.credits.remaining))
    set('sum-renews', `${number(monthly.left)} of ${number(monthly.of)} free this month · renews ${longDay(monthly.resetsAt)} (UTC)${data.credits.purchased ? ` · ${number(data.credits.purchased)} bought` : ''}`)
    setBar('sum-meter', monthly.left, monthly.of)
    set('sum-used', number(days.reduce((sum, d) => sum + d.credits, 0)))
    set('sum-pages', number(http + browser))
    const newest = data.keys.find((k) => k.enabled)
    set('conn-key', newest ? `${newest.prefix}…  (${newest.label})` : 'No key yet')
    renderKeys(data.keys, load)
    keyNames = new Map(data.keys.map((k) => [k.id, `${k.label} (${k.prefix}…)`]))
    const keyFilter = $('f-key')
    if (keyFilter && keyFilter.options.length === 1) {
      for (const key of data.keys) keyFilter.append(new Option(`${key.label} (${key.prefix}…)`, key.id))
      keyFilter.append(new Option('Playground', 'playground'))
    }
    renderActivity()

    set('acct-email', data.email || 'No email address on record')
    const providers = $('acct-providers')
    if (providers) {
      const names = (data.providers || []).map((p) => PROVIDERS[p] || p)
      providers.replaceChildren(...(names.length ? names : ['Not recorded']).map((name) => { const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = name; return chip }))
    }
    set('acct-month', `${number(monthly.left)} of ${number(monthly.of)} free credits left, renewed on ${day(monthly.resetsAt)} (UTC)`)
    set('acct-bought', data.credits.purchased ? number(data.credits.purchased) : 'None')
    set('play-left', `You have ${number(data.credits.remaining)} left.`)
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

  // Toggle groups: one pressed button per group, which sets a view and draws again.
  const toggles = (attribute, apply) => {
    for (const button of document.querySelectorAll(`[data-${attribute}]`)) {
      button.addEventListener('click', () => {
        for (const other of button.parentElement.querySelectorAll(`[data-${attribute}]`)) other.setAttribute('aria-pressed', String(other === button))
        apply(button.dataset[attribute])
      })
    }
  }
  toggles('range', (value) => { usedRange = Number(value); drawUsed() })
  toggles('group', (value) => { usageView.group = value; drawUsage() })
  toggles('measure', (value) => { usageView.measure = value; drawUsage() })
  // The Connect page opens the setup an Overview tile links to.
  const opened = location.hash && document.getElementById(location.hash.slice(1))
  if (opened && opened.tagName === 'DETAILS') opened.open = true
  glyphField($('used-ascii'), 120, 16, 2)
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

  // The Playground (the Scrape and Map pages, one layout): a selector whose panel of tiles picks the endpoint, the URL
  // card with the octopus behind it (dashboard-octopus.js), whose options, formats and code open as printed panels; the
  // result; the recent runs as receipts. The card goes to POST /api/account/run, which the hosted API answers and
  // charges as it would a key's call.
  const play = $('play-form')
  if (play) {
    const output = $('play-output')
    const evidence = $('play-evidence')
    const submit = $('play-submit')
    const glyphs = window.OctoGlyphs
    const creature = glyphs && $('pg-octopus') ? glyphs.octopus($('pg-octopus'), play) : null
    if (glyphs && $('pg-sea')) glyphs.current($('pg-sea'))
    let endpoint = play.dataset.endpoint
    let answer = null
    let view = 'markdown'
    let lang = 'curl'
    const IDLE_NOTE = ''
    const COST = {
      scrape: ['1–5 credits', 'A page read over HTTP costs 1 credit, one that needs a browser 5, and one that is blocked or kept out by robots.txt nothing.'],
      map: ['0–1 credit', 'A map that finds URLs costs 1 credit; one that finds none costs nothing.'],
    }
    const LABEL = { scrape: 'Extract page', map: 'Map site' }
    const goLabel = (text = LABEL[endpoint]) => { const label = document.createElement('span'); label.id = 'pg-go-label'; label.textContent = text; const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '→'; submit.replaceChildren(label, ' ', arrow) }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    /** Text that turns into other text through glyphs, left to right, as the site's menus decode theirs (nav.js). */
    const morph = (element, to) => {
      if (!element) return
      clearTimeout(element.morphing)
      if (still) { element.textContent = to; return }
      const from = element.textContent
      const noise = '·:+×#'
      const length = Math.max(from.length, to.length)
      let step = 0
      const tick = () => {
        step += 1
        const done = step / 8
        let text = ''
        for (let i = 0; i < length; i++) {
          const ahead = i / length < done
          const target = to[i] ?? ''
          text += ahead ? target : target === ' ' || from[i] === ' ' ? ' ' : noise[(i + step) % noise.length]
        }
        element.textContent = step >= 8 ? to : text.replace(/\s+$/, '')
        if (step < 8) element.morphing = setTimeout(tick, 32)
      }
      tick()
    }
    /** The card's toolbar prints in again, as a panel does, when the mode changes what it holds. */
    const reprint = (element) => {
      if (still || !element) return
      element.classList.remove('is-switching'); void element.offsetWidth; element.classList.add('is-switching')
      setTimeout(() => element.classList.remove('is-switching'), 450)
    }
    // The scrape's settings, by the home page's rules (playground-request.js): the view, main content or the whole page,
    // and the fields. One run returns every view, so the view only picks what is shown and what Get code asks for.
    const rules = window.OctoRequest
    const VIEW_NAMES = { markdown: 'Markdown', links: 'Links', info: 'Page info', fields: 'Fields', json: 'JSON', evidence: 'Evidence Record' }
    const fieldList = $('pg-field-list')
    const readFields = () => [...fieldList.querySelectorAll('.pg-field')].map((row) => ({ name: row.querySelector('input').value.trim(), type: row.querySelector('select').value })).filter((field) => field.name)
    const scrapeRequest = () => {
      const form = new FormData(play)
      return { url: String(form.get('url') ?? '').trim(), view: String(form.get('view') ?? 'markdown'), onlyMainContent: form.get('scope') !== 'whole', fields: readFields() }
    }
    const body = () => {
      const form = new FormData(play)
      const url = String(form.get('url') ?? '').trim()
      if (endpoint === 'map') {
        const search = String(form.get('search') ?? '').trim()
        return { url, limit: Math.min(5000, Math.max(1, Math.round(Number(form.get('limit')) || 100))), ...(search ? { search } : {}) }
      }
      return rules.runBody(scrapeRequest())
    }
    const drawCode = () => {
      const scrape = endpoint === 'scrape'
      const request = scrape ? scrapeRequest() : body()
      if (!request.url) request.url = 'https://example.com'
      // The home page's Get code body for a scrape (getCode.ts, restBody); the map's own.
      const sent = scrape ? rules.restBody(request) : request
      const json = JSON.stringify(sent)
      const api = `https://api.octocrawl.dev/v1/${endpoint}`
      set('play-code', lang === 'curl'
        ? `curl ${api} \\\n  -H 'authorization: Bearer oc_YOUR_KEY' \\\n  -H 'content-type: application/json' \\\n  -d '${json.replace(/'/g, "'\\''")}'`
        : `const response = await fetch('${api}', {\n  method: 'POST',\n  headers: { authorization: 'Bearer oc_YOUR_KEY', 'content-type': 'application/json' },\n  body: JSON.stringify(${JSON.stringify(sent, null, 2).replace(/\n/g, '\n  ')}),\n})\nconst result = await response.json()`)
      if (scrape) {
        set('pg-format-label', VIEW_NAMES[request.view])
        // The Options button says what differs from the defaults, as on the home page: the fields, or a dot for the whole page.
        const badge = $('pg-options-badge')
        badge.hidden = !request.fields.length && request.onlyMainContent
        badge.textContent = request.fields.length ? String(request.fields.length) : '•'
        set('pg-scope-note', request.onlyMainContent ? 'Headers, menus and footers are left out.' : 'The whole page, headers and menus included; a page with no clear main content returns everything.')
        const count = fieldList.querySelectorAll('.pg-field').length
        set('pg-fields-count', `${String(request.fields.length).padStart(2, '0')}/${rules.MAX_FIELDS}`)
        set('pg-fields-error', rules.fieldProblem(request.fields) ?? '')
        $('pg-field-new').disabled = count >= rules.MAX_FIELDS
        $('pg-field-add').disabled = count >= rules.MAX_FIELDS
      }
    }

    // The fields editor, as the home page's: numbered rows of a name and a type, × to remove, a line to add one, and the
    // product preset.
    const fieldRow = (field) => {
      const row = document.createElement('div'); row.className = 'pg-field'; row.setAttribute('role', 'listitem')
      const index = document.createElement('span'); index.className = 'pg-field-index'; index.setAttribute('aria-hidden', 'true')
      const name = document.createElement('input'); name.maxLength = 64; name.placeholder = 'field name'; name.value = field.name; name.autocomplete = 'off'; name.spellcheck = false
      const type = document.createElement('select')
      for (const [value, label] of rules.FIELD_TYPES) type.append(new Option(label, value))
      type.value = field.type
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'pg-field-remove'; remove.textContent = '×'
      remove.addEventListener('click', () => { row.remove(); renumber(); drawCode(); $('pg-field-new').focus() })
      row.append(index, name, type, remove)
      return row
    }
    const renumber = () => [...fieldList.querySelectorAll('.pg-field')].forEach((row, i) => {
      row.querySelector('.pg-field-index').textContent = String(i + 1).padStart(2, '0')
      row.querySelector('input').setAttribute('aria-label', `Field ${i + 1} name`)
      row.querySelector('select').setAttribute('aria-label', `Field ${i + 1} type`)
      row.querySelector('.pg-field-remove').setAttribute('aria-label', `Remove field ${i + 1}`)
    })
    const addField = (field) => {
      if (fieldList.querySelectorAll('.pg-field').length >= rules.MAX_FIELDS) return
      fieldList.append(fieldRow(field)); renumber()
      // Fields asked for are what the run is for: the view follows, as on the home page.
      if (play.view.value === 'markdown') play.view.value = 'fields'
      drawCode()
    }
    const addNew = () => { const name = $('pg-field-new').value.trim(); if (!name) return; addField({ name, type: 'string' }); $('pg-field-new').value = ''; $('pg-field-new').focus() }
    $('pg-field-add').addEventListener('click', addNew)
    $('pg-field-new').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addNew() } })
    $('pg-fields-preset').addEventListener('click', () => { const have = new Set(readFields().map((field) => field.name)); for (const field of rules.PRODUCT_FIELDS) if (!have.has(field.name)) addField(field) })

    // Each format's icon on the home page's glyph grid (src/main.ts, FORMAT_ICONS): lit cells over faint dots.
    const FORMAT_ICONS = {
      markdown: ['#####..', '.......', '######.', '#####..', '######.', '.......', '####...'],
      links: ['...####', '.....##', '....#.#', '...#..#', '..#....', '.#.....', '#......'],
      info: ['..###..', '.#...#.', '#..#..#', '#.....#', '#..#..#', '.#.#.#.', '..###..'],
      fields: ['##.####', '.......', '##.###.', '.......', '##.####', '.......', '##.##..'],
      json: ['..#.#..', '.#...#.', '.#...#.', '#.....#', '.#...#.', '.#...#.', '..#.#..'],
    }
    const SVG = 'http://www.w3.org/2000/svg'
    for (const box of document.querySelectorAll('#pg .tile-icon')) {
      const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '0 0 49 49'); svg.setAttribute('class', 'glyph-icon')
      FORMAT_ICONS[box.dataset.icon].forEach((row, y) => [...row].forEach((cell, x) => {
        const lit = cell === '#'
        const mark = document.createElementNS(SVG, lit ? 'rect' : 'circle')
        const attributes = lit ? [['x', x * 7 + 1.2], ['y', y * 7 + 1.2], ['width', 4.6], ['height', 4.6], ['rx', 1]] : [['cx', x * 7 + 3.5], ['cy', y * 7 + 3.5], ['r', 0.9]]
        for (const [name, value] of attributes) mark.setAttribute(name, String(value))
        mark.setAttribute('class', lit ? 'on' : 'off')
        svg.append(mark)
      }))
      box.append(svg)
    }
    // Picking a format after a run shows that view of the same result; before, it sets what the run is for.
    play.addEventListener('change', (event) => { if (event.target.name === 'view') { view = event.target.value; if (answer) show(); setTimeout(close, still ? 0 : 160) } })

    // Panels: one open at a time, printed in as the site's menus are (nav.js): a reveal in steps, then rows and glyphs.
    const panels = [...document.querySelectorAll('#pg [data-panel]')]
    const close = () => { for (const button of panels) { button.setAttribute('aria-expanded', 'false'); $(button.dataset.panel).hidden = true } }
    const decode = (element, delay) => {
      const text = element.textContent
      const noise = '·:+×#'
      let step = 0
      setTimeout(function tick() {
        step += 1
        element.textContent = step >= 6 ? text : text.replace(/\S/g, (c, i) => (i / text.length < step / 6 ? c : noise[(i + step) % noise.length]))
        if (step < 6) setTimeout(tick, 32)
      }, delay)
    }
    const print = (panel) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      panel.classList.remove('is-printing'); void panel.offsetWidth; panel.classList.add('is-printing')
      ;[...panel.querySelectorAll('.pg-check, .pg-fields label, .pg-tile, .format-tile, .pg-field, .code, p')].forEach((row, i) => row.style.setProperty('--row', String(i)))
      ;[...panel.querySelectorAll('.pg-kicker, code')].forEach((element, i) => { if (!element.closest('pre')) decode(element, 40 + i * 18) })
      setTimeout(() => panel.classList.remove('is-printing'), 700)
    }
    for (const button of panels) {
      button.addEventListener('click', () => {
        const panel = $(button.dataset.panel)
        const opening = panel.hidden
        close()
        if (!opening) return
        panel.hidden = false
        button.setAttribute('aria-expanded', 'true')
        print(panel)
      })
    }
    document.addEventListener('click', (event) => { if (!event.target.closest('.pg-panel, [data-panel]')) close() })
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close() })

    // The selector's tiles: the same card, its options and its address change in place.
    const PAGES = { scrape: ['Scrape', 'Read one page as Markdown, with its Evidence Record, on this account\'s credits at the API\'s price.'], map: ['Map', 'List the URLs of a site from its sitemap and links, on this account\'s credits at the API\'s price.'] }
    const switchTo = (next, push) => {
      endpoint = next
      $('pg').dataset.endpoint = next
      play.dataset.endpoint = next
      for (const element of document.querySelectorAll('#pg [data-only]')) element.hidden = element.dataset.only !== next
      for (const tile of document.querySelectorAll('#pg .pg-tile[data-endpoint]')) tile.setAttribute('aria-pressed', String(tile.dataset.endpoint === next))
      const pick = { scrape: ['Extract', 'Scrape', '▤'], map: ['Discover', 'Map', '⌗'] }[next]
      if (push) {
        morph($('pg-picker-kicker'), pick[0]); morph($('pg-picker-name'), pick[1]); morph($('pg-picker-glyph'), pick[2])
        reprint(play.querySelector('.pg-toolbar'))
        if (creature) creature.pulse()
      } else { set('pg-picker-kicker', pick[0]); set('pg-picker-name', pick[1]); set('pg-picker-glyph', pick[2]) }
      for (const link of document.querySelectorAll('.dash-nav a')) { if (link.getAttribute('href') === `/dashboard/${next}/`) link.setAttribute('aria-current', 'page'); else if (/\/dashboard\/(scrape|map)\/$/.test(link.getAttribute('href'))) link.removeAttribute('aria-current') }
      placeMark()
      const [title, lead] = PAGES[next]
      // The page's title decodes into the new mode's name, as the selector's does.
      if (push) morph(document.querySelector('.dash-head h1'), title); else document.querySelector('.dash-head h1').textContent = title
      const leadLine = document.querySelector('.dash-head .dash-lead')
      if (leadLine) leadLine.textContent = lead
      document.title = `${title} | Octocrawl Dashboard`
      set('play-cost', COST[next][0])
      $('play-cost').title = COST[next][1]
      if (push && $('pg-go-label')) morph($('pg-go-label'), LABEL[next]); else goLabel()
      if (!push) close()
      $('play-result').hidden = true
      set('play-summary', IDLE_NOTE)
      answer = null
      view = next === 'scrape' ? play.view.value : 'links'
      if (push) { const url = play.url.value.trim(); history.replaceState(null, '', `/dashboard/${next}/${url ? `?url=${encodeURIComponent(url)}` : ''}`) }
      drawCode()
    }
    // The highlight moves to the tile picked, the stage changes under the open panel, and the panel closes a moment later.
    for (const tile of document.querySelectorAll('#pg .pg-tile[data-endpoint]')) {
      tile.addEventListener('click', () => {
        if (tile.dataset.endpoint !== endpoint) switchTo(tile.dataset.endpoint, true)
        setTimeout(() => { close(); play.url.focus({ preventScroll: true }) }, still ? 0 : 220)
      })
    }

    const linkList = (links) => (Array.isArray(links) ? links.map((link) => (typeof link === 'string' ? link : link && link.url)).filter(Boolean) : null)
    const facts = (record) => {
      const rows = [
        ['Requested URL', record.requestedUrl], ['Final URL', record.finalUrl], ['Fetched at (UTC)', record.fetchedAt], ['HTTP status', record.httpStatus],
        ['Result', record.reason ? `${record.status} · ${record.reason}` : record.status], ['Lane', record.lane],
        ['robots.txt', record.robotsDecision ? record.robotsDecision.decision : null], ['Body SHA-256', record.rawSha256],
        ['Markdown SHA-256', record.outputSha256 ? record.outputSha256.markdown : null],
        ['Extractor', record.extractor ? `${record.extractor.name} ${record.extractor.version}` : null],
      ]
      evidence.replaceChildren(...rows.flatMap(([name, value]) => {
        const term = document.createElement('dt'); term.textContent = name
        const detail = document.createElement('dd'); detail.textContent = value === null || value === undefined || value === '' ? '—' : String(value)
        if (/SHA-256/.test(name)) detail.className = 'mono'
        return [term, detail]
      }))
    }
    const show = () => {
      if (!answer) return
      for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-selected', String(tab.dataset.view === view))
      evidence.hidden = view !== 'evidence'
      let text
      if (view === 'markdown') text = typeof answer.markdown === 'string' && answer.markdown.trim() ? answer.markdown : 'No Markdown came back. The result and the Evidence Record say why.'
      else if (view === 'links') { const links = linkList(answer.links); text = links && links.length ? links.join('\n') : 'No links came back.' }
      // What the page declares about itself, as the home page's Page info shows it.
      else if (view === 'info') text = JSON.stringify({ url: (answer.evidenceRecord && answer.evidenceRecord.finalUrl) || answer.requestedUrl || answer.url, title: answer.metadata ? answer.metadata.title : null, ...(answer.metadata ? { metadata: answer.metadata } : {}) }, null, 2)
      else if (view === 'fields') text = answer.json !== undefined && answer.json !== null ? JSON.stringify(answer.json, null, 2) : 'No fields were asked for: add them in Options and run again. The run reads them from the page itself.'
      else if (view === 'evidence') {
        if (answer.evidenceRecord) { facts(answer.evidenceRecord); text = JSON.stringify(answer.evidenceRecord, null, 2) } else { evidence.replaceChildren(); text = 'This answer has no Evidence Record.' }
      } else text = JSON.stringify(answer, null, 2)
      output.textContent = text
    }
    // A result tab and the format panel are one choice, as on the home page (the Evidence Record has no tile).
    for (const tab of document.querySelectorAll('[data-view]')) tab.addEventListener('click', () => { view = tab.dataset.view; if (view !== 'evidence') play.view.value = view; show(); drawCode() })
    toggles('lang', (value) => { lang = value; drawCode() })
    play.addEventListener('input', drawCode)
    play.addEventListener('change', drawCode)
    const asked = new URLSearchParams(location.search).get('url')
    if (asked) play.url.value = asked
    switchTo(endpoint, false)

    const outcomeOf = (result) => {
      if (endpoint === 'map') {
        const links = linkList(result.links) ?? []
        return [`${number(links.length)} URLs · ${result.status}`, links.length ? 'ok' : 'warn']
      }
      const reason = result.failureReason || (result.evidenceRecord && result.evidenceRecord.reason)
      return [reason ? `${result.status} · ${reason}` : result.status, READ.has(result.status) ? 'ok' : result.status === 'partial' ? 'warn' : 'bad']
    }
    const idle = (note = IDLE_NOTE) => { if (creature) creature.set('idle'); $('pg-stage').classList.remove('is-running'); set('play-summary', note) }
    play.addEventListener('submit', async (event) => {
      event.preventDefault()
      close()
      const request = body()
      try { if (!/^https?:$/.test(new URL(request.url).protocol)) throw new Error('scheme') } catch { say('Enter a full address that starts with http:// or https://.', true); play.url.focus(); return }
      const problem = endpoint === 'scrape' ? rules.fieldProblem(scrapeRequest().fields) : null
      if (problem) { say(`Check the fields in Options: ${problem}`, true); return }
      say('')
      const ran = endpoint
      submit.disabled = true
      submit.textContent = 'Running…'
      $('play-result').hidden = true
      $('pg-stage').classList.add('is-running')
      if (creature) creature.set('running')
      set('play-summary', ran === 'scrape' ? 'Reading the page. One that needs a browser can take up to a minute.' : 'Reading the site\'s sitemap and links.')
      try {
        const response = await fetch('/api/account/run', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: ran, ...request }) })
        if (response.status === 401) { location.replace(`/signin/?next=${encodeURIComponent(location.pathname + location.search)}`); return }
        const result = await response.json().catch(() => null)
        if (!response.ok || !result) {
          const why = response.status === 429 && result ? `${result.error}. ${(result.agentHints || [])[0] ?? ''}`
            : response.status === 400 ? (result && result.error && result.error !== 'invalid_request' ? result.error : 'That request could not be run: check the address and the options.')
              : response.status === 503 ? 'The Playground is not available right now. Try again later.'
                : response.status === 504 ? 'The run took too long and was stopped. Activity shows what it cost, if anything.'
                  : 'The run could not reach hosted Octocrawl. Try again in a minute.'
          say(why.trim(), true)
          idle()
          return
        }
        if (ran !== endpoint) { idle(); return }
        answer = result
        const used = response.headers.get('x-credits-used')
        const left = response.headers.get('x-credits-remaining')
        const [label, mark] = outcomeOf(result)
        const pill = $('play-status'); pill.className = `status ${mark}`; pill.textContent = label
        const record = result.evidenceRecord
        const where = ran === 'scrape' && record ? [record.finalUrl || record.requestedUrl, record.httpStatus ? `HTTP ${record.httpStatus}` : null, record.lane ? `${record.lane} lane` : null] : [result.url]
        const spent = used === null ? null : `${used} credit${used === '1' ? '' : 's'} used${left === null ? '' : `, ${number(left)} left`}`
        set('play-detail', [...where, spent].filter(Boolean).join(' · '))
        if (ran === 'scrape') view = play.view.value
        if (view === 'markdown' && !(typeof result.markdown === 'string' && result.markdown.trim()) && record) view = 'evidence'
        idle()
        $('play-result').hidden = false
        show()
        $('play-result').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
        // The balance and the run's request line changed: read both again.
        activity = null
        load()
      } catch { say('The run could not reach hosted Octocrawl. Try again in a minute.', true); idle() } finally { submit.disabled = false; goLabel() }
    })

    // A recent run's card runs it again: its endpoint and URL go back into the form.
    $('run-cards').addEventListener('click', (event) => {
      const again = event.target.closest('[data-again]')
      if (!again) return
      play.url.value = again.dataset.again
      if (again.dataset.endpoint !== endpoint) switchTo(again.dataset.endpoint, true)
      drawCode()
      play.url.focus()
      $('pg-stage').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    })
  }

  // A faint field of glyphs behind every page's title, in motion between two forms: a flag (the left edge held, the
  // field read further up or down the further right a cell is) and rings spreading from the top right corner. The two
  // are blended cell by cell with a weight that eases from one to the other and back, about every 8 seconds, so the
  // glyphs change in place on the grid and the field keeps its shape. About 15 frames a second; paused in a hidden tab,
  // still with reduced motion.
  const noise = $('dash-noise')
  if (noise) {
    const glyphs = ' .:-=+*#%'
    const COLS = 110
    const ROWS = 12
    const field = (x, y) => Math.abs(Math.sin(x * 0.19 + y * 0.8) * Math.cos(x * 0.045 - y * 0.35))
    const flag = (x, y, t) => {
      const hold = (x / (COLS - 1)) ** 1.6
      return field(x, y - hold * (2.4 * Math.sin(x * 0.12 - t * 1.6) + 0.7 * Math.sin(x * 0.27 - t * 2.5 + y * 0.15)))
    }
    const rings = (x, y, t) => {
      const d = Math.hypot((COLS - 1 - x) * 0.5, y)
      return Math.abs(Math.sin(d * 0.42 - t * 1.8)) * (0.45 + 0.55 * field(x, y))
    }
    const draw = (t) => {
      // 0 is all flag, 1 all rings; the cosine eases each change in and out.
      const w = t === null ? 0 : 0.5 - 0.5 * Math.cos((t / 16) * Math.PI * 2)
      let text = ''
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const v = t === null ? field(x, y) : (1 - w) * flag(x, y, t) + w * rings(x, y, t)
          text += glyphs[Math.min(glyphs.length - 1, Math.floor(v * (glyphs.length - 1)))]
        }
        text += '\n'
      }
      noise.textContent = text
    }
    draw(null)
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let last = 0
      const frame = (ms) => {
        if (!document.hidden && ms - last >= 66) { last = ms; draw(ms / 1000) }
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }
  }


  // The Overview's banner: the octopus's arms in glyphs, three rising from each bottom corner and curling back toward
  // their own edge, thick at the root and thin at the tip, keeping clear of the text in the middle. They sway slowly
  // (about 8 frames a second); still with reduced motion or in a hidden tab.
  const field = $('ev-field')
  if (field) {
    const RAMP = ' .:-=+*#%@'
    // Each arm: where its root sits (share of the width from its edge), how long it is (share of the height), and a phase.
    const ARMS = [[0.03, 0.95, 0.0], [0.11, 1.15, 1.9], [0.2, 0.8, 3.4]]
    const draw = (t) => {
      const cols = Math.max(40, Math.ceil(field.clientWidth / 6.6))
      const rows = Math.max(12, Math.ceil(field.clientHeight / 12))
      const narrow = cols < 90
      const density = new Float32Array(cols * rows)
      const sucker = new Uint8Array(cols * rows)
      const stamp = (x, y, width) => {
        const x0 = Math.max(0, Math.floor(x - width * 2 - 1)); const x1 = Math.min(cols - 1, Math.ceil(x + width * 2 + 1))
        const y0 = Math.max(0, Math.floor(y - width - 1)); const y1 = Math.min(rows - 1, Math.ceil(y + width + 1))
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) {
            const d = Math.hypot((cx - x) * 0.5, cy - y) / width
            const v = Math.exp(-d * d * 1.8)
            const at = cy * cols + cx
            if (v > density[at]) density[at] = v
          }
        }
      }
      for (const side of [1, -1]) {
        for (const [root, length, phase] of ARMS) {
          // Walk the arm from its root: it leans in, bends back toward its own edge and curls over at the tip.
          let x = side === 1 ? (narrow ? root * 0.5 : root) * cols : (1 - (narrow ? root * 0.5 : root)) * cols
          let y = rows + 1
          const steps = 80
          const step = (length * rows * (narrow ? 0.9 : 1.25)) / steps
          for (let k = 0; k <= steps; k++) {
            const s = k / steps
            const theta = 1.2 + 0.85 * s + 3.4 * s ** 3 + 0.3 * s * Math.sin(t * 0.8 + phase + s * 2.2)
            const width = 2.4 * (1 - s) ** 1.2 + 0.45
            stamp(x, y, width)
            // A sucker every few steps, on the inner side of the curl.
            if (k % 7 === 3 && s < 0.85) {
              const sx = Math.round(x - side * Math.sin(theta) * width * 2.2); const sy = Math.round(y - Math.cos(theta) * width * 1.1)
              if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) sucker[sy * cols + sx] = 1
            }
            x += side * Math.cos(theta) * step * 2
            y -= Math.sin(theta) * step
          }
        }
      }
      let text = ''
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const at = y * cols + x
          text += sucker[at] && density[at] > 0.25 ? 'o' : RAMP[Math.min(RAMP.length - 1, Math.floor(density[at] * RAMP.length))]
        }
        text += '\n'
      }
      field.textContent = text
    }
    draw(0)
    if ('ResizeObserver' in window) new ResizeObserver(() => draw(performance.now() / 1000)).observe(field)
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => { if (!document.hidden) draw(performance.now() / 1000) }, 125)
  }

  load()
})()
