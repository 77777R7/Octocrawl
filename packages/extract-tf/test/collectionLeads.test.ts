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

  it('does not bring back excluded cards or widen a caller\'s selection', () => {
    const excluded = extract(page(), { pruneSelectors: ['#leads'] })
    expect(excluded.md).toContain('Chronological report 24 on')
    for (const [title] of LEADS) expect(excluded.md).not.toContain(title)
    const selected = extract(page(), { includeSelectors: ['#stream'] })
    expect(selected.md).toContain('Chronological report 24 on')
    expect(selected.md).not.toContain(LEADS[0]![0])
  })
})
