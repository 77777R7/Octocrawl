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
    delete_unfinished: 'Your keys, credits, usage and request lines are deleted, but the sign-in account may not be. Sign in again: if you can, delete the account once more to finish.',
  }
  const PROVIDERS = { github: 'GitHub', google: 'Google' }
  // A provider whose address already has an account waits to be linked (auth.ts, w2l_link): the page says which ways
  // are left, hides the one that was just tried, and puts the note above the buttons.
  const linkNeeded = (provider) => {
    const others = ['GitHub', 'Google'].filter((name) => name !== PROVIDERS[provider]).concat('an email link')
    return `Your email address already has an Octocrawl account, made with ${others.join(' or ')}. Sign in that way below, in this browser, within 30 minutes. ${PROVIDERS[provider]} is then added to the account, and next time it signs you in directly.`
  }

  const signin = $('#signin')
  if (signin) {
    // Deleting an account asks for a fresh sign-in (auth.ts, /auth/delete/start): the visitor is still signed in, so the
    // page stays instead of going on, and a sign-in that fails part way lands on Settings.
    const reauth = params.get('reauth') === 'delete'
    const deleted = params.get('deleted') === '1'
    const next = reauth ? '/dashboard/settings/' : safeNext(params.get('next'))
    for (const link of signin.querySelectorAll('[data-provider]')) link.href = `/auth/${link.dataset.provider}?next=${encodeURIComponent(next)}`
    const message = $('#signin-message')
    const tried = params.get('provider')
    if (params.get('error') === 'link_needed' && PROVIDERS[tried]) {
      signin.querySelector(`[data-provider="${tried}"]`).hidden = true
      say(message, linkNeeded(tried))
      message.classList.add('is-notice')
      signin.querySelector('.signin-options').before(message)
    } else if (ERRORS[params.get('error')]) say(message, ERRORS[params.get('error')], true)
    else if (reauth) {
      say(message, 'To delete your account, sign in again below the way you usually do, in this browser, within 10 minutes. This sign-in deletes the account instead of opening it. You can make a new account with the same email address later.')
      message.classList.add('is-notice')
      signin.querySelector('.signin-options').before(message)
    } else if (deleted) {
      // Deleted is not banned: the page says, above the buttons, that signing in again starts a new, empty account.
      say(message, 'Your Octocrawl account is deleted, with its keys, credits, usage and request lines. You can still use Octocrawl: sign in below with the same email address to start a new, empty account, or use it without an account.')
      message.classList.add('is-notice')
      signin.querySelector('.signin-options').before(message)
    }
    if (!reauth && !deleted) fetch('/api/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((me) => { if (me && me.signedIn) location.replace(next) }).catch(() => {})
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
