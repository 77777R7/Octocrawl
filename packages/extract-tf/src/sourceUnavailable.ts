import { visibleText } from './invisible.js'

// A page-wide outage, not an unavailable product, table cell or quoted incident.
const NOTICE = /^(?:(?:we(?:['’]re| are) sorry|nous sommes désolés)[!.:\s]*)?(?:(?:(?:the|this|our)\s+)?(?:web\s*site|site|service)\s+(?:is\s+)?(?:(?:currently|temporarily)\s+)?unavailable\b|(?:le|notre|ce)\s+site\s+web\s+n['’]est\s+pas\s+disponible\b)/i
const IGNORED = 'script,style,noscript,template,svg,nav,footer,aside,blockquote,q,pre,code'

function hidden(element: Element): boolean {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (node.hasAttribute('hidden') || node.hasAttribute('data-w2l-hidden')) return true
    const style = node.getAttribute('style') ?? ''
    if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|content-visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/i.test(style)) return true
  }
  return false
}

function text(element: Element): string {
  if (hidden(element)) return ''
  const pending: Node[] = [element]
  const parts: string[] = []
  let length = 0
  while (pending.length > 0 && length <= 4_000) {
    const node = pending.pop()!
    if (node.nodeType === 3) {
      const value = node.textContent ?? ''
      parts.push(value); length += value.length
    } else if (node.nodeType === 1) {
      const child = node as Element
      if (child.matches(IGNORED) || hidden(child)) continue
      for (let i = child.childNodes.length - 1; i >= 0; i--) pending.push(child.childNodes[i]!)
    }
  }
  return parts.join(' ')
}

/** Conservative source signal, before caller selection/pruning. No content or fetch status is changed. */
export function sourceUnavailable(doc: Document): boolean {
  const title = visibleText(doc.querySelector('title')?.textContent ?? '')
  if (!title.split(/\s[-–|/]\s/).some(part => NOTICE.test(part))) return false
  const body = doc.body
  if (body === null) return false
  // A populated visible data region contradicts a page-wide outage, even if a stale notice remains.
  for (const table of Array.from(body.querySelectorAll('table,[role="table"],[role="grid"],[role="treegrid"]'))) {
    if (hidden(table) || table.closest(IGNORED)) continue
    const rows = Array.from(table.querySelectorAll('tr,[role="row"]')).filter(row => !hidden(row))
    if (rows.length >= 2 && rows.some(row => Array.from(row.querySelectorAll('td,[role="cell"],[role="gridcell"]')).filter(cell => visibleText(text(cell)) !== '').length >= 2)) return false
  }
  const visible = visibleText(text(body))
  if (visible.length === 0 || visible.length > 4_000) return false
  let noticeChars = 0
  for (const node of Array.from(body.querySelectorAll('p,h1,h2'))) {
    if (node.closest(IGNORED) || hidden(node)) continue
    const value = visibleText(text(node))
    if (NOTICE.test(value)) noticeChars += value.length
  }
  return noticeChars >= visible.length / 4
}
