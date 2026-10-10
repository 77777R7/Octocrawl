/** First-party page events. They go to this site's own /api/events and end up as log lines: no third-party script,
 * no new cookie, nothing about the page a visitor extracts. A visitor who asks not to be tracked sends nothing. */
type Props = Record<string, string | number | boolean | undefined>

const optedOut = (() => {
  try { return navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true }
  catch { return true }
})()

export function track(name: string, props: Props = {}): void {
  if (optedOut) return
  const clean = Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined))
  const body = JSON.stringify({ name, props: clean })
  try { if (navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' }))) return } catch { /* fall back to fetch */ }
  void fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {})
}

/** Where the visit came from: the referring site's host (never its path), any utm_ tags on this page's address, and
 * its `from` tag, which the site's own links use to name the page or channel that sent a visitor (`?from=blog-…`). */
export function trackPageView(): void {
  const props: Props = { path: location.pathname }
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null
    if (referrer && referrer.host !== location.host) props.ref = referrer.hostname.replace(/^www\./, '')
  } catch { /* An unreadable referrer is left out. */ }
  const query = new URLSearchParams(location.search)
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
    const value = query.get(key)
    if (value) props[key] = value.slice(0, 120)
  }
  const from = query.get('from')
  if (from && /^[a-z0-9-]{1,60}$/.test(from)) props.from = from
  track('page_view', props)
}

/** Clicks on the page's own links: where they lead (GitHub, the docs, a section of this page), by path only. */
export function trackLinkClicks(root: HTMLElement): void {
  root.addEventListener('click', event => {
    const link = (event.target as Element | null)?.closest?.('a[href]')
    if (!(link instanceof HTMLAnchorElement)) return
    // Links taken from the page a visitor extracted (its final URL, its Markdown, its link list) are never logged.
    if (link.closest('#detail-url, .readable-content, .link-row')) return
    let url: URL
    try { url = new URL(link.href) } catch { return }
    const target = url.host === location.host
      ? url.pathname.startsWith('/docs') ? 'docs' : url.hash ? 'section' : 'site'
      : url.hostname === 'github.com' ? 'github' : 'external'
    track('link_click', { target, href: url.host === location.host ? `${url.pathname}${url.hash}`.slice(0, 120) : `${url.hostname}${url.pathname}`.slice(0, 120) })
  })
}
