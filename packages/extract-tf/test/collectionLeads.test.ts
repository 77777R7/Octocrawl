import { describe, expect, it } from 'vitest'
import type { ExtractorOptions } from '@w2l/contracts'
import { extractTf, htmlToMarkdown } from '../src/index.js'

/**
 * A news section page shaped like a newspaper's (D6, lead cards): a lead
 * story and a row of top cards above the chronological stream, all of one
 * teaser template, with a sidebar of recommended and most-read cards of the
 * same template and a promoted card. As on the page, each card's standfirst
 * is a link and the page has no h1, so the article cascade finds no prose and
 * the card list alone is chosen.
 * Synthetic: no retained page.
 */
const card = (title: string, href: string, cls = 'teaser') =>
  `<div class="${cls} ${cls}--article"><div class="${cls}__heading"><a href="${href}">${title}</a></div><p class="${cls}__standfirst"><a href="${href}">The standfirst of this story, one sentence long.</a></p></div>`
const LEADS: Array<[string, string]> = [
  ['Lead story: chipmakers race to build new plants', '/content/lead-1'],
  ['Top card: regulators open an inquiry into cloud contracts', '/content/top-2'],
  ['Top card: a start-up raises money for battery recycling', '/content/top-3'],
]
const stream = Array.from({ length: 24 }, (_, i) => `<li class="stream-item"><time>October ${20 - i} 2026</time>${card(`Chronological report ${i + 1} on the technology industry`, `/content/stream-${i + 1}`)}</li>`).join('')
function page(o: { main?: string; leadClass?: string } = {}): string {
  const open = o.main ?? 'main'
  const close = open.split(' ')[0]
  return `<!doctype html><html><head><title>Technology</title></head><body>
<nav>${card('Navigation marker story with a long enough title', '/content/nav')}</nav>
<${open} id="site-content"><div class="grid">
<div class="grid-top" id="leads"><section><h2>Lead story in Technology</h2>${card(LEADS[0]![0], LEADS[0]![1], o.leadClass)}</section>
<section><h2>News</h2>${card(LEADS[1]![0], LEADS[1]![1], o.leadClass)}${card(LEADS[2]![0], LEADS[2]![1], o.leadClass)}</section>
<section><h2>Promoted content</h2>${card('Promoted marker story with a long enough title', '/content/promo')}</section></div>
<div class="grid-sidebar"><section><h2>Most read</h2>${card('Sidebar marker story with a long enough title', '/content/side')}</section></div>
<section><h2>Recommended</h2>${card('Recommendation marker story with a long enough title', '/content/rec')}</section>
<div class="grid-bottom" id="stream"><h2>More Technology</h2><ul class="stream-list">${stream}</ul></div>
<section><h2>Podcasts</h2>${card('Following section marker story with a long title', '/content/after')}</section>
</div></${close}><footer>${card('Footer marker story with a long enough title', '/content/foot')}</footer></body></html>`
}
const URL = 'https://news.fixture.test/technology'
function extract(html: string, options: ExtractorOptions = {}) {
  const out = extractTf.extract(html, { url: URL, ...options })
  return { out, md: htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl }) }
}

describe('the lead cards of a news collection above its chronological list (D6)', () => {
  it.each(['main', 'div role="main"'])('keeps the lead story and top cards before the stream, within %s', (main) => {
    const { out, md } = extract(page({ main }))
    expect(out.strategy).toBe('list')
    for (const [title, href] of LEADS) expect(md).toContain(`[${title}](https://news.fixture.test${href})`)
    expect(md).toContain('Chronological report 1 on')
    expect(md).toContain('Chronological report 24 on')
    expect(md.indexOf(LEADS[0]![0])).toBeLessThan(md.indexOf(LEADS[1]![0]))
    expect(md.indexOf(LEADS[2]![0])).toBeLessThan(md.indexOf('Chronological report 1 on'))
    expect(md).toContain('News')
  })

  it('leaves out navigation, sidebar, recommended, promoted, following and footer cards', () => {
    const { md } = extract(page())
    for (const marker of ['Navigation marker', 'Sidebar marker', 'Recommendation marker', 'Promoted marker', 'Following section marker', 'Footer marker']) expect(md).not.toContain(marker)
  })

  it('needs the list items\' card template and a main around both', () => {
    expect(extract(page({ main: 'div' })).md).not.toContain(LEADS[0]![0])
    expect(extract(page({ leadClass: 'promo-card' })).md).not.toContain(LEADS[0]![0])
  })

  it('takes one story per card, never a layout wrapper of several that shares a utility class', () => {
    const html = page().replace(/class="teaser teaser--article"/g, 'class="teaser flex"').replace('<div class="grid-top" id="leads">',
      '<div class="grid-top" id="leads"><div class="flex gap-8"><section><h2>Top stories</h2>' + card('Wrapped top story with a long enough title', '/content/wrapped').replace('teaser teaser--article', 'teaser flex') + '</section>' +
      '<div><section><h2>Most read</h2><ol><li><a href="/mr1">Most-read marker story with a long title</a></li></ol></section>' +
      '<section><h2>Sponsored</h2><p><a href="/ad">Sponsored marker: buy our cloud product today and save</a></p></section></div></div>')
    const { md } = extract(html)
    expect(md).toContain('Wrapped top story with a long enough title')
    for (const marker of ['Most-read marker', 'Sponsored marker']) expect(md).not.toContain(marker)
  })

  it('leaves out cards under a heading of paid, partner, ranked or other sections\' content', () => {
    for (const heading of ['Partner content', 'Paid content', 'From our partners', 'Sponsored by Acme', 'Advertisement', 'Trending now', "Editor's picks", 'Most shared', 'Recently viewed', 'More from Markets']) {
      const html = page().replace('<div class="grid-sidebar">', `<section><h2>${heading}</h2>${card('Extra marker story with a long enough title', '/content/extra')}</section><div class="grid-sidebar">`)
      expect(extract(html).md, heading).not.toContain('Extra marker')
    }
    for (const name of ['right-rail', 'trending', 'partner-content', 'paid-post', 'popular']) {
      const html = page().replace('<div class="grid-sidebar">', `<div class="${name}">${card('Extra marker story with a long enough title', '/content/extra')}</div><div class="grid-sidebar">`)
      expect(extract(html).md, name).not.toContain('Extra marker')
    }
  })

  it('leaves the page as it was for the checks that read it after selection', () => {
    // The page's hydration data lists ten headlines; the HTML shows them all, as cards, an "In brief" list and the stream.
    const records = Array.from({ length: 10 }, (_, k) => ({ title: `Headline ${k + 1}: a story on the technology industry` }))
    const html = page().replace('<title>Technology</title>', `<title>Technology</title><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { stories: records } })}</script>`)
      .replace('<div class="grid-sidebar">', `<div class="in-brief"><h3>In brief</h3><ul>${records.slice(3, 10).map((r, k) => `<li><a href="/content/brief-${k}">${r.title}</a></li>`).join('')}</ul></div><div class="grid-sidebar">`)
      .replace(LEADS[0]![0], records[0]!.title).replace(LEADS[1]![0], records[1]!.title).replace(LEADS[2]![0], records[2]!.title)
    const { out, md } = extract(html)
    expect(md).toContain(records[0]!.title)
    expect(out.render?.clientRendered ?? false).toBe(false)
  })

  it('does not bring back excluded cards or widen a caller\'s selection', () => {
    const excluded = extract(page(), { pruneSelectors: ['#leads'] })
    expect(excluded.md).toContain('Chronological report 24 on')
    for (const [title] of LEADS) expect(excluded.md).not.toContain(title)
    const selected = extract(page(), { includeSelectors: ['#stream'] })
    expect(selected.md).toContain('Chronological report 24 on')
    expect(selected.md).not.toContain(LEADS[0]![0])
  })
})
