// The dashboard's pages (scripts/build-docs.mjs). They read GET /api/account and make and revoke keys through
// /api/account/keys (packages/public-preview account.ts); without a session they send the visitor to sign in. Text
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

  const render = (data, load) => {
    const { monthly } = data.credits
    const days = lastDays(data.usage)
    set('side-credits', number(data.credits.remaining))
    meter($('side-meter'), monthly.left, monthly.of)
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

  // A faint field of glyphs behind the page title, the same on every load.
  const noise = $('dash-noise')
  if (noise) {
    const glyphs = ' .:-=+*#%'
    let text = ''
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 110; x++) text += glyphs[Math.floor(Math.abs(Math.sin(x * 0.19 + y * 0.8) * Math.cos(x * 0.045 - y * 0.35)) * (glyphs.length - 1))]
      text += '\n'
    }
    noise.textContent = text
  }

  load()
})()
