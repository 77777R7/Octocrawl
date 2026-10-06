import { track } from './analytics'

export type WaitlistTrigger = 'quota' | 'footer' | 'limits' | 'connect-mcp'

/** Shows the early-access form (prerendered hidden by src/waitlistMarkup.ts) and sends it to /api/waitlist.
 * `open` is for the calls to action: after the daily previews run out, and the Limits and Connect MCP pages' links (?from=limits, ?from=connect-mcp). */
export function mountWaitlist(): { open(trigger: WaitlistTrigger): void } {
  const section = document.querySelector<HTMLElement>('#waitlist')
  const form = section?.querySelector<HTMLFormElement>('.waitlist-form')
  if (!section || !form) return { open: () => {} }
  const status = form.querySelector<HTMLElement>('.waitlist-status')!
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
  let trigger: WaitlistTrigger = 'footer'
  section.hidden = false

  const open = (from: WaitlistTrigger) => {
    trigger = from
    track('waitlist_open', { trigger })
    section.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    form.querySelector<HTMLInputElement>('input[name="email"]')?.focus({ preventScroll: true })
  }

  form.addEventListener('submit', event => {
    event.preventDefault()
    const data = new FormData(form)
    let ref = ''
    try { const referrer = document.referrer ? new URL(document.referrer) : null; if (referrer && referrer.host !== location.host) ref = referrer.hostname.replace(/^www\./, '') } catch { /* left out */ }
    const body = {
      email: String(data.get('email') ?? ''), role: String(data.get('role') ?? ''), needs: data.getAll('needs').map(String),
      useCase: String(data.get('useCase') ?? ''), trigger, ref, website: String(data.get('website') ?? ''),
    }
    button.disabled = true
    status.className = 'waitlist-status'
    status.textContent = 'Sending…'
    void fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
      .then(response => response.status)
      .catch(() => 0)
      .then(code => {
        if (code === 204) {
          track('waitlist_submit', { trigger })
          const done = Object.assign(document.createElement('p'), { className: 'waitlist-done', textContent: 'You are on the list. We will email you when hosted Octocrawl opens.' })
          form.replaceChildren(done)
          // The shorter form moves the page; keep the confirmation where the visitor is looking.
          done.scrollIntoView({ block: 'nearest' })
          return
        }
        button.disabled = false
        status.className = 'waitlist-status is-error'
        status.textContent = code === 400 ? 'Check the email address and try again.'
          : code === 429 ? 'Too many sign-ups from here today. Please try again tomorrow.'
            : 'We could not save that right now. Try again in a few minutes, or write to hello@octocrawl.dev.'
      })
  })

  const query = new URLSearchParams(location.search)
  const from = query.get('from')
  if (from === 'limits' || from === 'connect-mcp') {
    query.delete('from')
    const rest = query.toString()
    history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`)
    open(from)
  }
  return { open }
}
