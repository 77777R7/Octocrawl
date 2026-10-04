import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodeXmlEntities, isGzipBytes, looksGzipped, parseSitemapXml, SITEMAP_MAX_ENTRIES } from '../src/sitemap.js'

const URLSET = (locs: string[]) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((loc) => `<url><loc>${loc}</loc><lastmod>2026-09-30</lastmod></url>`).join('\n')}</urlset>`

describe('parseSitemapXml', () => {
  it('reads a urlset in document order and an index as its children', () => {
    const set = parseSitemapXml(URLSET(['https://example.com/', 'https://example.com/a', 'http://example.com/b']))
    expect(set).toEqual({ kind: 'urlset', locs: ['https://example.com/', 'https://example.com/a', 'http://example.com/b'], truncated: false, dropped: 0 })
    const index = parseSitemapXml('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://example.com/a.xml</loc></sitemap><sitemap><loc>https://example.com/b.xml.gz</loc><lastmod>2026-01-01</lastmod></sitemap></sitemapindex>')
    expect(index).toEqual({ kind: 'index', locs: ['https://example.com/a.xml', 'https://example.com/b.xml.gz'], truncated: false, dropped: 0 })
  })

  it('decodes entities and CDATA, trims whitespace and takes only the root namespace\'s loc elements', () => {
    const text = URLSET(['https://example.com/search?q=a&amp;b=2', '  https://example.com/x  ', '<![CDATA[https://example.com/cdata?a=1&b=2]]>', 'https://example.com/&#x4e2d;&#25991;'])
      .replace('<lastmod>2026-09-30</lastmod>', '<image:image><image:loc>https://cdn.example.com/photo.jpg</image:loc></image:image>')
    expect(parseSitemapXml(text).locs).toEqual(['https://example.com/search?q=a&b=2', 'https://example.com/x', 'https://example.com/cdata?a=1&b=2', 'https://example.com/%E4%B8%AD%E6%96%87'])
    // A prefixed document: the prefixed loc is the one that counts.
    expect(parseSitemapXml('<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><sm:url><sm:loc>https://example.com/p</sm:loc></sm:url></sm:urlset>').locs).toEqual(['https://example.com/p'])
    expect(decodeXmlEntities('&lt;a&gt; &quot;q&quot; &apos;s&apos; &amp;amp; &unknown; &#65;')).toBe('<a> "q" \'s\' &amp; &unknown; A')
  })

  it('drops entries that are not http(s) URLs and reports how many', () => {
    const parsed = parseSitemapXml(URLSET(['ftp://example.com/file', 'mailto:a@example.com', 'not a url', '', 'https://example.com/ok']))
    expect(parsed.locs).toEqual(['https://example.com/ok'])
    expect(parsed.dropped).toBe(4)
  })

  it('stops at the protocol\'s 50 000 entries and says so', () => {
    const many = URLSET(Array.from({ length: SITEMAP_MAX_ENTRIES + 5 }, (_, i) => `https://example.com/p/${i}`))
    const parsed = parseSitemapXml(many)
    expect(parsed.locs).toHaveLength(SITEMAP_MAX_ENTRIES)
    expect(parsed.locs.at(-1)).toBe(`https://example.com/p/${SITEMAP_MAX_ENTRIES - 1}`)
    expect(parsed.truncated).toBe(true)
  })

  it('reads an HTML or empty body as not a sitemap, and a BOM-prefixed one as one', () => {
    expect(parseSitemapXml('<!doctype html><html><body><h1>Not found</h1><a href="https://example.com/">home</a></body></html>')).toEqual({ kind: 'not_sitemap', locs: [], truncated: false, dropped: 0 })
    expect(parseSitemapXml('').kind).toBe('not_sitemap')
    expect(parseSitemapXml('{"urlset":[]}').kind).toBe('not_sitemap')
    expect(parseSitemapXml(`﻿${URLSET(['https://example.com/'])}`).locs).toEqual(['https://example.com/'])
  })

  it('reads each entry\'s lastmod and news:title only when asked, aligned with locs and never borrowed from a neighbour', () => {
    const text = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:n="http://www.google.com/schemas/sitemap-news/0.9">
<url><loc>https://example.com/a</loc><lastmod> 2026-09-30T08:00:00+00:00 </lastmod><n:news><n:title>Kiln &amp; glaze</n:title></n:news></url>
<url><lastmod>2026-01-01</lastmod><loc>https://example.com/b</loc></url>
<url><loc>ftp://example.com/dropped</loc><lastmod>1999-01-01</lastmod></url>
<url><loc>https://example.com/c</loc><n:news><n:title><![CDATA[Firing <guide>]]></n:title></n:news></url>
<url><loc>https://example.com/d</loc></url>
</urlset>`
    const plain = parseSitemapXml(text)
    expect(plain).toEqual({ kind: 'urlset', locs: ['https://example.com/a', 'https://example.com/b', 'https://example.com/c', 'https://example.com/d'], truncated: false, dropped: 1 })
    const detailed = parseSitemapXml(text, { details: true })
    expect(detailed.locs).toEqual(plain.locs)
    expect(detailed.details).toEqual([{ lastmod: '2026-09-30T08:00:00+00:00', title: 'Kiln & glaze' }, { lastmod: '2026-01-01' }, { title: 'Firing <guide>' }, {}])
    // Without a news namespace, a title element is not a news title.
    expect(parseSitemapXml(URLSET(['https://example.com/']).replace('</url>', '<title>Not news</title></url>'), { details: true }).details).toEqual([{ lastmod: '2026-09-30' }])
  })
})

describe('gzip detection', () => {
  it('recognises a gzip body by its magic number or the .gz suffix, not by other bytes or names', () => {
    const bytes = gzipSync(Buffer.from(URLSET(['https://example.com/'])))
    expect(isGzipBytes(bytes)).toBe(true)
    expect(looksGzipped('https://example.com/sitemap.xml', bytes)).toBe(true)
    const plain = new TextEncoder().encode(URLSET([]))
    expect(isGzipBytes(plain)).toBe(false)
    expect(looksGzipped('https://example.com/sitemap.xml.gz', plain)).toBe(true)
    expect(looksGzipped('https://example.com/sitemap.xml?format=gz', plain)).toBe(false)
    expect(looksGzipped('not a url', plain)).toBe(false)
    expect(isGzipBytes(new Uint8Array([0x1f]))).toBe(false)
  })
})
