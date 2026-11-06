import { describe, expect, it } from 'vitest'
import type { FetchResult } from '@w2l/contracts'
import { offPageWarning, redirectedOffPage, withOffPageWarning } from '../src/offPage.js'

describe('a page delivered in place of the one asked for (redirected_off_page)', () => {
  it('is the home page, an ancestor, or a shorter path with no segment in common with the one asked for', () => {
    // IDS Cologne, 2026-11-04: an exhibitor page sent to the home page.
    expect(redirectedOffPage('https://www.english.ids-cologne.de/exhibitor/acme-dental/', 'https://www.english.ids-cologne.de/')).toBe(true)
    // The home page of another host, and the fixture site's /home.
    expect(redirectedOffPage('https://shop.example.test/item/5', 'https://www.example.test/')).toBe(true)
    expect(redirectedOffPage('https://site.test/wrong/redirect-home', 'https://site.test/home')).toBe(true)
    // The section above the page, a language home, a soft 404 reached by redirect.
    expect(redirectedOffPage('https://site.test/exhibitors/acme', 'https://site.test/exhibitors/')).toBe(true)
    expect(redirectedOffPage('https://site.test/en/exhibitor/acme', 'https://site.test/de/')).toBe(true)
    expect(redirectedOffPage('https://site.test/article/12345', 'https://site.test/404')).toBe(true)
  })

  it('is not a redirect that keeps the page', () => {
    const page = 'https://www.site.test/docs/guide/'
    for (const kept of [
      page, 'http://www.site.test/docs/guide', 'https://site.test/docs/guide', 'https://www.site.test/docs/guide/index.html', 'https://www.site.test/Docs/Guide',
      'https://www.site.test/docs/guide?utm=x', 'https://www.site.test/docs/guide#top',
      // A new slug beside the old, a deeper default page, a language prefix, a shorter address that keeps a segment.
      'https://www.site.test/docs/guide-2', 'https://www.site.test/docs/guide/intro', 'https://www.site.test/en/docs/guide', 'https://www.site.test/guide',
    ]) expect(redirectedOffPage(page, kept), kept).toBe(false)
    // The root asked for is served by whatever the site shows there, and a URL that does not parse decides nothing.
    expect(redirectedOffPage('https://site.test/', 'https://site.test/home')).toBe(false)
    expect(redirectedOffPage('https://site.test/index.html', 'https://site.test/')).toBe(false)
    // A default locale that collapses to the root, and a section's own page, are the root and the section.
    for (const [from, to] of [['/en/', '/'], ['/home', '/'], ['/index', '/'], ['/default.aspx', '/'], ['/en/home', '/en/'], ['/zh-hant/docs/guide', '/docs/guide'], ['/news/main', '/news/']]) {
      expect(redirectedOffPage(`https://site.test${from}`, `https://site.test${to}`), `${from} to ${to}`).toBe(false)
    }
    // A one-segment page sent to the root, and a page under a locale sent to another locale's root, are off the page.
    expect(redirectedOffPage('https://site.test/exhibitors', 'https://site.test/')).toBe(true)
    expect(redirectedOffPage('https://site.test/en/docs/guide', 'https://site.test/docs/')).toBe(true)
    expect(redirectedOffPage('not a url', 'https://site.test/')).toBe(false)
  })

  it('takes a page a script left for one as deep, with nothing in common, as off the page; a server redirect of that shape, a shared segment or a deeper page stay (IDS Cologne, 2026-11-06)', () => {
    const asked = 'https://site.test/exhibitor/acme/'
    const list = 'https://site.test/our-exhibitors/list-of-exhibitors/?go=x&'
    expect(redirectedOffPage(asked, list, true)).toBe(true)
    expect(redirectedOffPage(asked, list)).toBe(false)
    expect(redirectedOffPage(asked, 'https://site.test/exhibitor/acme-gmbh/', true)).toBe(false)
    expect(redirectedOffPage(asked, 'https://site.test/a/b/c', true)).toBe(false)
    expect(offPageWarning(asked, list, true)?.message).toContain('another page, by a script of its own')
    expect(offPageWarning(asked, 'https://site.test/', true)?.message).toContain('its home page')
  })

  it('names the requested and the final URL in the warning, and where the site sent the request', () => {
    expect(offPageWarning('https://site.test/a/b', 'https://site.test/')).toEqual({ code: 'redirected_off_page', message: 'The site sent the request for https://site.test/a/b on to https://site.test/, its home page: the content is that page\'s, not the requested page\'s.' })
    expect(offPageWarning('https://site.test/a/b', 'https://site.test/a')?.message).toContain('a page above the one asked for')
    expect(offPageWarning('https://site.test/a/b', 'https://site.test/a/c')).toBeNull()
  })

  it('warns a success or partial result once, after its other warnings, and leaves a failed result or a page the steps led elsewhere alone', () => {
    const result = (over: Partial<FetchResult>): FetchResult => ({
      requestedUrl: 'https://site.test/a/b', status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'http', escalations: [],
      markdown: '# Home', truncated: false, truncatedAt: null, compliance: null,
      evidence: { finalUrl: 'https://site.test/', httpStatus: 200, redirectChain: ['https://site.test/a/b', 'https://site.test/'], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
      usage: { wallMs: 1, bytesWire: 1, bytesDecompressed: 1, requestCount: 2, attemptCount: 1, contentTokens: 1, browserMs: 0, externalCostUsd: null },
      trace: [],
      ...over,
    })
    const warned = withOffPageWarning(result({ warnings: [{ code: 'robots_overridden', message: 'set aside' }] }))
    expect(warned.warnings?.map((warning) => warning.code)).toEqual(['robots_overridden', 'redirected_off_page'])
    expect(withOffPageWarning(warned)).toBe(warned)
    expect(withOffPageWarning(result({ status: 'partial' })).warnings?.map((warning) => warning.code)).toEqual(['redirected_off_page'])
    expect(withOffPageWarning(result({ status: 'failed', failureReason: 'empty_unverified', markdown: null })).warnings).toBeUndefined()
    expect(withOffPageWarning(result({ actions: { steps: [], scrapes: [], lists: [] } as unknown as FetchResult['actions'] })).warnings).toBeUndefined()
    expect(withOffPageWarning(result({ evidence: { ...result({}).evidence, finalUrl: 'https://site.test/a/b' } })).warnings).toBeUndefined()
  })
})
