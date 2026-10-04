import { describe, expect, it } from 'vitest'
import { parseSitemapXml, SITEMAP_MAX_ENTRIES } from '../src/sitemap.js'

describe('parseSitemapXml', () => {
  it('reads details in linear time when the locs have no url element around them', () => {
    // Every loc bare: each entry's window must stop at the next loc instead of scanning to </urlset>.
    const bare = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({ length: SITEMAP_MAX_ENTRIES }, (_, i) => `<loc>https://example.com/p/${i}</loc><lastmod>2026-09-${String((i % 28) + 1).padStart(2, '0')}</lastmod>`).join('\n')}</urlset>`
    const began = performance.now()
    const parsed = parseSitemapXml(bare, { details: true })
    const elapsed = performance.now() - began
    expect(parsed.locs).toHaveLength(SITEMAP_MAX_ENTRIES)
    expect(parsed.details).toHaveLength(SITEMAP_MAX_ENTRIES)
    expect(parsed.details?.slice(0, 2)).toEqual([{ lastmod: '2026-09-01' }, { lastmod: '2026-09-02' }])
    expect(parsed.details?.at(-1)).toEqual({ lastmod: `2026-09-${String(((SITEMAP_MAX_ENTRIES - 1) % 28) + 1).padStart(2, '0')}` })
    // The quadratic scan took about 25 s here; a linear one takes well under a second.
    expect(elapsed).toBeLessThan(3000)
  })
})
