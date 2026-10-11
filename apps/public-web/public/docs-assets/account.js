// The sign-in and account pages (scripts/build-docs.mjs). They talk only to this site: /auth/* and /api/* in
// packages/public-preview (auth.ts, account.ts). No third-party script, as the site's CSP allows none.
(() => {
  const $ = (selector) => document.querySelector(selector)
  const params = new URLSearchParams(location.search)
  const safeNext = (value) => (typeof value === 'string' && /^\/(?![/\\])[\x21-\x5b\x5d-\x7e]{0,300}$/.test(value) ? value : '/account/')
  const say = (element, text, error = false) => { element.textContent = text; element.classList.toggle('is-error', error) }
  const day = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '')
  const number = (n) => Number(n).toLocaleString('en-US')

  const ERRORS = {
    cancelled: 'Sign-in was cancelled. Try again when you are ready.',
    other_provider: 'This email address already signs in another way. Use the way you signed in before.',
    expired: 'That sign-in link has expired or was used already. Start again.',
    invalid: 'That sign-in did not work. Check the email address and try again.',
    unavailable: 'Sign-in is not available right now. Try again in a few minutes.',
    link_needed: 'This email address already has an Octocrawl account. Sign in once the way you did before, here in this browser, and PROVIDER is added to it.',
  }
  const PROVIDERS = { github: 'GitHub', google: 'Google' }

  const signin = $('#signin')
  if (signin) {
    const next = safeNext(params.get('next'))
    for (const link of signin.querySelectorAll('[data-provider]')) link.href = `/auth/${link.dataset.provider}?next=${encodeURIComponent(next)}`
    const message = $('#signin-message')
    if (ERRORS[params.get('error')]) say(message, ERRORS[params.get('error')].replace('PROVIDER', PROVIDERS[params.get('provider')] || 'the new way'), true)
    fetch('/api/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((me) => { if (me && me.signedIn) location.replace(next) }).catch(() => {})
    const form = $('#email-form')
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const email = form.email.value.trim()
      const button = form.querySelector('button')
      button.disabled = true
      try {
        const response = await fetch('/auth/email', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
        if (response.ok) say(message, `We sent a sign-in link to ${email}. Open it in this browser. It works once, for an hour.`)
        else if (response.status === 400) say(message, 'Check the email address and try again.', true)
        else if (response.status === 429) say(message, 'Too many sign-in links were asked for. Wait an hour, or sign in with GitHub or Google.', true)
        else say(message, ERRORS.unavailable, true)
      } catch { say(message, ERRORS.unavailable, true) } finally { button.disabled = false }
    })
  }

  const account = $('#account')
  if (account) {
    const message = $('#account-message')
    const keysBody = $('#keys-body')
    const render = (data) => {
      $('#account-email').textContent = data.email || 'your account'
      $('#credits-remaining').firstChild.textContent = number(data.credits.remaining)
      $('#credits-detail').textContent = `${number(data.credits.monthly.left)} of this month's ${number(data.credits.monthly.of)} free credits left, renewed on ${day(data.credits.monthly.resetsAt)} (UTC)${data.credits.purchased ? `, plus ${number(data.credits.purchased)} bought` : ''}.`
      keysBody.replaceChildren(...data.keys.map((key) => {
        const row = document.createElement('tr')
        const cells = [key.label, `${key.prefix}…`, day(key.createdAt), key.enabled ? 'Active' : 'Revoked']
        for (const text of cells) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell) }
        const action = document.createElement('td')
        if (key.enabled) {
          const button = document.createElement('button')
          button.type = 'button'; button.className = 'account-button quiet'; button.textContent = 'Revoke'
          let armed = false
          button.addEventListener('click', async () => {
            if (!armed) { armed = true; button.textContent = 'Click again to revoke'; setTimeout(() => { armed = false; button.textContent = 'Revoke' }, 4000); return }
            button.disabled = true
            const response = await fetch(`/api/account/keys/${key.id}/revoke`, { method: 'POST', credentials: 'same-origin' }).catch(() => null)
            if (response && response.status === 204) load()
            else { button.disabled = false; say(message, 'The key could not be revoked. Try again.', true) }
          })
          action.append(button)
        }
        row.append(action)
        return row
      }))
      $('#keys-empty').hidden = data.keys.length > 0
      const usage = $('#usage-body')
      usage.replaceChildren(...data.usage.slice().reverse().map((d) => {
        const row = document.createElement('tr')
        for (const [text, numeric] of [[d.day, false], [d.http, true], [d.browser, true], [d.notFound, true], [d.map, true], [d.unread, true], [d.credits, true]]) {
          const cell = document.createElement('td'); cell.textContent = numeric ? number(text) : text; if (numeric) cell.className = 'num'; row.append(cell)
        }
        return row
      }))
      $('#usage-empty').hidden = data.usage.length > 0
      if (PROVIDERS[params.get('linked')]) say(message, `${PROVIDERS[params.get('linked')]} is now linked to this account: you can sign in with it next time.`)
      account.hidden = false
    }
    const load = async () => {
      try {
        const response = await fetch('/api/account', { credentials: 'same-origin' })
        if (response.status === 401) { location.replace('/signin/?next=/account/'); return }
        if (!response.ok) throw new Error(String(response.status))
        render(await response.json())
      } catch { account.hidden = false; say(message, 'Your account could not be loaded. Reload the page in a minute.', true) }
    }
    $('#key-form').addEventListener('submit', async (event) => {
      event.preventDefault()
      const form = event.currentTarget
      const button = form.querySelector('button')
      button.disabled = true
      try {
        const response = await fetch('/api/account/keys', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: form.label.value }) })
        if (response.status === 201) {
          const { key } = await response.json()
          $('#new-key').textContent = key
          $('#new-key-mcp').textContent = `claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp --header "Authorization: Bearer ${key}"`
          $('#key-reveal').hidden = false
          form.reset()
          load()
        } else if (response.status === 409) say(message, 'An account holds at most five active keys. Revoke one first.', true)
        else say(message, 'The key could not be created. Try again.', true)
      } catch { say(message, 'The key could not be created. Try again.', true) } finally { button.disabled = false }
    })
    $('#copy-key').addEventListener('click', async () => {
      const key = $('#new-key').textContent
      try { await navigator.clipboard.writeText(key); $('#copy-key').textContent = 'Copied' } catch { getSelection().selectAllChildren($('#new-key')) }
    })
    load()
  }
})()
