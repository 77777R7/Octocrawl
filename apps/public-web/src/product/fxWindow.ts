/** A card's window, shared by /scrape/'s What you get (scrapePage.ts) and the home page's What it does
 * (featureSections.ts): a line of a window is a list of segments, each a class (h heading, p punctuation, u link
 * target, k key, v value, c note, a aside, w warning) and its text. Build-time markup: no DOM. */

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export type Segment = readonly [string, string]

/** A card's window: a small dark browser window on the painting holding one result. With `source`, scrapeWindows.ts
 * shows that text in the window's shape first (the raw HTML) and decodes it into the result when the card comes to the
 * front; without it the result types itself in. */
export function cardWindow(o: { icon?: string; url: string; tag: string; label: string; source?: string; wrap?: boolean; lines: Segment[][] }): string {
  const lines = o.lines.map((line) => `<span class="fx-ln">${line.map(([cls, text]) => `<span class="${cls}">${esc(text)}</span>`).join('')}</span>`).join('\n')
  const text = o.lines.map((line) => line.map(([, t]) => t).join('').trimEnd()).join('\n')
  // The window decodes in place (scrapeWindows.ts), so assistive tech reads the result from a copy that never changes.
  return `<div class="fx-win${o.wrap ? ' is-wrap' : ''}"${o.source ? ` data-source="${esc(o.source)}"` : ''}>
              <pre class="visually-hidden">${esc(`${o.label}:\n${text}`)}</pre>
              <p class="fx-win-bar" aria-hidden="true">${o.icon ? `<img src="/assets/sites/${o.icon}.png" alt="" width="16" height="16" />` : '<span class="fx-win-dot" aria-hidden="true"></span>'}<span class="fx-win-url">${esc(o.url)}</span><b class="fx-win-tag">${esc(o.tag)}</b></p>
              <pre class="fx-win-body" aria-hidden="true">${lines}</pre>
            </div>`
}

/** A Markdown line split into segments: ** and link brackets as punctuation, link targets as links. */
export function markdownSegments(text: string): Segment[] {
  return text.split(/(\*\*|\]\([^)]*\)|\[)/).filter(Boolean).map((part) => [part === '**' || part === '[' ? 'p' : part.startsWith('](') ? 'u' : 'b', part] as const)
}
