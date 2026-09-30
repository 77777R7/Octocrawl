// First-party page events, as on the home page (src/analytics.ts): to this site's /api/events only, nothing sent
// for a visitor who asks not to be tracked.
const optedOut = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true
function track(name, props = {}) {
  if (optedOut) return
  const body = JSON.stringify({ name, props })
  try { if (navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' }))) return } catch {}
  fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {})
}
{
  const props = { path: location.pathname }
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null
    if (referrer && referrer.host !== location.host) props.ref = referrer.hostname.replace(/^www\./, '')
  } catch {}
  const query = new URLSearchParams(location.search)
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) if (query.get(key)) props[key] = query.get(key).slice(0, 120)
  track('page_view', props)
}
document.addEventListener('click', event => {
  const link = event.target.closest?.('a[href]')
  if (!link) return
  let url
  try { url = new URL(link.href) } catch { return }
  if (url.host === location.host && url.pathname === location.pathname) return
  const target = url.host === location.host ? (url.pathname.startsWith('/docs') ? 'docs' : 'site') : url.hostname === 'github.com' ? 'github' : 'external'
  track('link_click', { target, href: (url.host === location.host ? url.pathname : url.hostname + url.pathname).slice(0, 120) })
})

document.addEventListener('click', async event => {
  const button = event.target.closest('.copy-code')
  if (!button) return
  const code = button.closest('.doc-code')?.querySelector('code')?.textContent
  if (!code) return
  track('docs_code_copy', { path: location.pathname })
  const original = button.textContent
  const announcement = document.querySelector('#copy-announcement')
  try {
    await navigator.clipboard.writeText(code)
    button.textContent = 'Copied'
    if (announcement) announcement.textContent = 'Code copied to clipboard.'
  } catch {
    button.textContent = 'Copy failed'
    if (announcement) announcement.textContent = 'Clipboard access is unavailable. Select the code to copy it.'
  }
  window.setTimeout(() => { button.textContent = original }, 2200)
})

function selectMcpTab(tab, focus = false) {
  const picker = tab.closest('.mcp-picker')
  if (!picker) return
  for (const candidate of picker.querySelectorAll('[role="tab"]')) {
    const selected = candidate === tab
    candidate.setAttribute('aria-selected', String(selected))
    candidate.tabIndex = selected ? 0 : -1
    const panel = picker.querySelector(`#${candidate.getAttribute('aria-controls')}`)
    if (panel) panel.hidden = !selected
  }
  if (focus) tab.focus()
}

document.addEventListener('click', event => {
  const tab = event.target.closest('.mcp-client-tab')
  if (tab) { selectMcpTab(tab); track('mcp_client_select', { client: tab.id.replace('mcp-tab-', '') }) }
})

document.addEventListener('keydown', event => {
  const tab = event.target.closest('.mcp-client-tab')
  if (!tab) return
  const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')]
  const index = tabs.indexOf(tab)
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tabs.length - 1
  else return
  event.preventDefault()
  selectMcpTab(tabs[next], true)
})

// On this page: the section being read is the last whose heading has passed near the top of the window.
const tocLinks = [...document.querySelectorAll('.doc-toc a')]
const tocHeads = tocLinks.map(link => document.getElementById(decodeURIComponent(link.hash.slice(1))))
let tocFrame = 0
function markSection() {
  tocFrame = 0
  let current = 0
  tocHeads.forEach((head, index) => { if (head && head.getBoundingClientRect().top < 140) current = index })
  tocLinks.forEach((link, index) => link.setAttribute('aria-current', String(index === current)))
}
if (tocLinks.length) {
  markSection()
  window.addEventListener('scroll', () => { tocFrame ||= requestAnimationFrame(markSection) }, { passive: true })
}
