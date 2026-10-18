import { describe, expect, it } from 'vitest'
import { NEWS_LEADS, newsCollectionFixture } from '@w2l/fixtures'
import { extractTf, htmlToMarkdown } from '../src/index.js'
import type { ExtractorOptions } from '@w2l/contracts'

function markdown(html: string, options: ExtractorOptions = {}): string {
  const out = extractTf.extract(html, { url: 'https://news.fixture.test/technology', ...options })
  return htmlToMarkdown(out.mainHtml, { baseUrl: out.baseUrl })
}

describe('collection lead cards beside the chronological list', () => {
  it.each(['main', 'div role="main"'])('retains all three headline/URL pairs and the stream within %s', tag => {
    const html = newsCollectionFixture('valid', tag)
    const out = extractTf.extract(html)
    expect(out.pageType).toBe('collection')
    expect(out.strategy).toBe('list')
    expect(out.mainHtml).not.toMatch(/^<(?:body|html)\b/)
    const md = markdown(html)
    for (const [title, href] of NEWS_LEADS) expect(md).toContain(`[${title}](https://news.fixture.test${href})`)
    expect(md).toContain('Chronological report 1 ')
    expect(md).toContain('Chronological report 24 ')
    expect(md.indexOf(NEWS_LEADS[0][0])).toBeLessThan(md.indexOf(NEWS_LEADS[1][0]))
    expect(md.indexOf(NEWS_LEADS[2][0])).toBeLessThan(md.indexOf('Chronological report 1 '))
  })

  it('does not widen to navigation, ads, recommendations, unrelated templates or following sections', () => {
    const md = markdown(newsCollectionFixture())
    for (const value of ['Navigation marker', 'Sidebar marker', 'Recommendation marker', 'Heading recommendation marker', 'Advertisement marker', 'Unrelated marker', 'Following section marker', 'Footer marker']) expect(md).not.toContain(value)
  })

  it('requires the same card template within the same semantic main', () => {
    const html = newsCollectionFixture()
    expect(markdown(html.replace('div role="main"', 'div'))).not.toContain(NEWS_LEADS[0][0])
    const unmatched = html.replace(/id="leads"[\s\S]*?<\/section><\/div>/, match => match.replaceAll('news-card', 'other-card'))
    expect(markdown(unmatched)).not.toContain(NEWS_LEADS[0][0])
  })

  it('honors inclusion and exclusion without restoring excluded lead cards', () => {
    const html = newsCollectionFixture()
    const included = markdown(html, { includeSelectors: ['#stream'] })
    expect(included).toContain('Chronological report 24 ')
    expect(included).not.toContain(NEWS_LEADS[0][0])
    const excluded = markdown(html, { pruneSelectors: ['#leads'] })
    expect(excluded).toContain('Chronological report 24 ')
    for (const [title] of NEWS_LEADS) expect(excluded).not.toContain(title)
  })
})
