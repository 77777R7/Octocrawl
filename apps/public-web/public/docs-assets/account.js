// The sign-in pages (scripts/build-docs.mjs). They talk only to this site: /auth/* and /api/me in
// packages/public-preview (auth.ts); the dashboard has dashboard.js. No third-party script, as the site's CSP allows none.
(() => {
  const $ = (selector) => document.querySelector(selector)
  const params = new URLSearchParams(location.search)
  const safeNext = (value) => (typeof value === 'string' && /^\/(?![/\\])[\x21-\x5b\x5d-\x7e]{0,300}$/.test(value) ? value : '/dashboard/')
  const say = (element, text, error = false) => { element.textContent = text; element.classList.toggle('is-error', error) }

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
})()
