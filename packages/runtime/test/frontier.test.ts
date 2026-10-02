import { describe, expect, it } from 'vitest'
import { DEFAULT_NETWORK_POLICY } from '@w2l/contracts'
import { Frontier } from '../src/frontier.js'

// The seed is the site's root: by default a crawl stays in the seed's path subtree (see the subtree test).
const SEED = 'https://fixture.test/'

function seeded(overrides: ConstructorParameters<typeof Frontier>[0] = { seedUrl: SEED }): Frontier {
  const frontier = new Frontier({ seedUrl: SEED, ...overrides })
  const result = frontier.seed()
  expect(result.accepted).toBe(true)
  return frontier
}

describe('Frontier seed / enqueue / visited', () => {
  it('seeds the canonical URL once and treats a second seed as duplicate', () => {
    const frontier = new Frontier({ seedUrl: `${SEED}?utm_source=nav` })
    expect(frontier.seed()).toMatchObject({
      accepted: true,
      canonicalUrl: SEED,
      reason: 'seeded',
    })
    expect(frontier.seed()).toMatchObject({ accepted: false, reason: 'duplicate' })
    expect(frontier.pendingCount()).toBe(1)
    expect(frontier.has(SEED)).toBe(true)
  })

  it('keeps /duplicate/a and /duplicate/c distinct after stripping utm on c', () => {
    const frontier = seeded()
    expect(frontier.enqueue('https://fixture.test/duplicate/a', 1)).toMatchObject({
      accepted: true,
      canonicalUrl: 'https://fixture.test/duplicate/a',
    })
    expect(frontier.enqueue('https://fixture.test/duplicate/c?utm_source=x', 1)).toMatchObject({
      accepted: true,
      canonicalUrl: 'https://fixture.test/duplicate/c',
    })
    expect(frontier.enqueue('https://fixture.test/duplicate/c', 1).reason).toBe('duplicate')
    expect(frontier.pendingCount()).toBe(3)
  })

  it('defaults to the seed host and refuses a different host', () => {
    const frontier = seeded()
    expect(frontier.enqueue('https://other.test/p', 1)).toMatchObject({
      accepted: false,
      reason: 'host_denied',
    })
  })

  it('uses the governance allowlist (exact / *.domain, never substring) when set', () => {
    const frontier = new Frontier({
      seedUrl: 'https://example.com/',
      allowlistedDomains: ['*.example.com'],
    })
    expect(frontier.seed().accepted).toBe(true)
    expect(frontier.enqueue('https://shop.example.com/p', 1).accepted).toBe(true)
    expect(frontier.enqueue('https://example.com.evil.net/p', 1).reason).toBe('host_denied')
    expect(frontier.enqueue('https://fixture.test/p', 1).reason).toBe('host_denied')
    // The list adds hosts to the seed's own: seed a.test with ['b.test'] follows both.
    const added = new Frontier({ seedUrl: 'https://a.test/', allowlistedDomains: ['b.test'] })
    added.seed()
    expect(added.enqueue('https://a.test/p', 1).accepted).toBe(true)
    expect(added.enqueue('https://b.test/p', 1).accepted).toBe(true)
    expect(added.enqueue('https://c.test/p', 1).reason).toBe('host_denied')
  })

  it('admits every host under the seed\'s apex with allowSubdomains, never a look-alike', () => {
    const frontier = new Frontier({ seedUrl: 'https://www.example.com/', allowSubdomains: true })
    frontier.seed()
    expect(frontier.enqueue('https://docs.example.com/x', 1).accepted).toBe(true)
    expect(frontier.enqueue('https://example.com/y', 1).accepted).toBe(true)
    expect(frontier.enqueue('https://example.com.evil.net/', 1).reason).toBe('host_denied')
    expect(frontier.enqueue('https://other.test/', 1).reason).toBe('host_denied')
  })

  it('admits any http(s) host with allowExternalLinks and still refuses other schemes', () => {
    const frontier = seeded({ seedUrl: SEED, allowExternalLinks: true })
    expect(frontier.enqueue('https://other.test/', 1).accepted).toBe(true)
    expect(frontier.enqueue('javascript:alert(1)', 1).reason).toBe('scheme_denied')
    expect(frontier.enqueue('mailto:a@b.test', 1).reason).toBe('scheme_denied')
  })

  it('keeps links on the seed host inside the seed\'s path subtree unless crawlEntireDomain is set', () => {
    const guide = new Frontier({ seedUrl: 'https://fixture.test/docs/guide/' })
    guide.seed()
    expect(guide.enqueue('https://fixture.test/docs/guide/intro', 1).accepted).toBe(true)
    expect(guide.enqueue('https://fixture.test/docs/other', 1)).toMatchObject({ accepted: false, reason: 'subtree_denied' })
    expect(guide.enqueue('https://fixture.test/blog', 1).reason).toBe('subtree_denied')
    // A seed that names a file scopes to its directory; one without a slash is a directory plus the exact path.
    const file = new Frontier({ seedUrl: 'https://fixture.test/docs/index.html' })
    file.seed()
    expect(file.enqueue('https://fixture.test/docs/api/', 1).accepted).toBe(true)
    expect(file.enqueue('https://fixture.test/about', 1).reason).toBe('subtree_denied')
    const search = new Frontier({ seedUrl: 'https://fixture.test/search?q=x' })
    search.seed()
    expect(search.enqueue('https://fixture.test/search?page=2&q=x', 1).accepted).toBe(true)
    expect(search.enqueue('https://fixture.test/search/x', 1).accepted).toBe(true)
    expect(search.enqueue('https://fixture.test/searching', 1).reason).toBe('subtree_denied')
    const whole = new Frontier({ seedUrl: 'https://fixture.test/docs/guide/', crawlEntireDomain: true })
    whole.seed()
    expect(whole.enqueue('https://fixture.test/blog', 1).accepted).toBe(true)
    // A host admitted beside the seed host is not path-scoped; the host the seed redirected to brings its own subtree.
    const sub = new Frontier({ seedUrl: 'https://www.example.com/docs/', allowSubdomains: true })
    sub.seed()
    expect(sub.enqueue('https://docs.example.com/anything', 1).accepted).toBe(true)
    expect(sub.enqueue('https://www.example.com/blog', 1).reason).toBe('subtree_denied')
    sub.followSeedRedirect('https://www.example.com/')
    expect(sub.enqueue('https://www.example.com/blog', 1).accepted).toBe(true)
  })

  it('matches includePaths / excludePaths against the canonical URL with regexOnFullURL, so a host-anchored pattern can decide', () => {
    const pattern = '^https://a\\.test/x\\?p='
    const full = new Frontier({ seedUrl: 'https://a.test/', allowExternalLinks: true, includePaths: [pattern], regexOnFullURL: true })
    full.seed()
    expect(full.enqueue('https://a.test/x?p=1', 1).accepted).toBe(true)
    expect(full.enqueue('https://b.test/x?p=1', 1)).toMatchObject({ accepted: false, reason: 'path_denied' })
    // Without the option the subject is the pathname, which never starts with a scheme: both are refused.
    const pathOnly = new Frontier({ seedUrl: 'https://a.test/', allowExternalLinks: true, includePaths: [pattern] })
    pathOnly.seed()
    expect(pathOnly.enqueue('https://a.test/x?p=1', 1).reason).toBe('path_denied')
    expect(pathOnly.enqueue('https://b.test/x?p=1', 1).reason).toBe('path_denied')
  })

  it('folds URLs that differ only in their query into the first one seen with ignoreQueryParameters, and fetches that first variant', () => {
    const frontier = new Frontier({ seedUrl: 'https://fixture.test/', ignoreQueryParameters: true })
    frontier.seed()
    expect(frontier.enqueue('/list?page=1', 1, 'https://fixture.test/')).toMatchObject({ accepted: true, canonicalUrl: 'https://fixture.test/list' })
    expect(frontier.enqueue('https://fixture.test/list?page=2', 1)).toEqual({ accepted: false, canonicalUrl: 'https://fixture.test/list', reason: 'duplicate', collapsedInto: 'https://fixture.test/list' })
    // A variant offered before is a plain repeat, not a second collapse.
    expect(frontier.enqueue('https://fixture.test/list?page=2', 1)).toEqual({ accepted: false, canonicalUrl: 'https://fixture.test/list', reason: 'duplicate' })
    expect(frontier.enqueue('https://fixture.test/list?page=1', 1)).toEqual({ accepted: false, canonicalUrl: 'https://fixture.test/list', reason: 'duplicate' })
    const t0 = 1_000
    const seed = frontier.dequeue(t0).item!
    frontier.release(seed.canonicalUrl)
    expect(frontier.dequeue(t0 + DEFAULT_NETWORK_POLICY.perHostMinDelayMs).item).toMatchObject({ url: 'https://fixture.test/list?page=1', canonicalUrl: 'https://fixture.test/list', via: 'link', from: 'https://fixture.test/' })
    expect(seed).toMatchObject({ via: 'seed' })
    expect(seed).not.toHaveProperty('from')
  })

  it('folds /index.html, /a/, the www twin and http into the first-seen page with deduplicateSimilarURLs, and keeps /x/y apart', () => {
    const frontier = new Frontier({ seedUrl: 'https://a.test/', deduplicateSimilarURLs: true })
    expect(frontier.seed().accepted).toBe(true)
    expect(frontier.enqueue('https://a.test/index.html', 1)).toEqual({ accepted: false, canonicalUrl: 'https://a.test/index.html', reason: 'duplicate', collapsedInto: 'https://a.test/' })
    expect(frontier.enqueue('https://a.test/x', 1).accepted).toBe(true)
    expect(frontier.enqueue('http://www.a.test/x/', 1)).toMatchObject({ reason: 'duplicate', collapsedInto: 'https://a.test/x' })
    expect(frontier.enqueue('https://a.test/x/y', 1).accepted).toBe(true)
    expect(frontier.pendingCount()).toBe(3)
    // Off, the variants are distinct pages, as before.
    const exact = new Frontier({ seedUrl: 'https://a.test/' })
    exact.seed()
    expect(exact.enqueue('https://a.test/index.html', 1).accepted).toBe(true)
  })

  it('drops URLs past maxDepth', () => {
    const frontier = seeded({ maxDepth: 1 })
    expect(frontier.enqueue('https://fixture.test/a', 1).accepted).toBe(true)
    expect(frontier.enqueue('https://fixture.test/b', 2).reason).toBe('depth')
  })

  it('filters discovered links by includePaths / excludePaths on the pathname, never the seed', () => {
    const frontier = seeded({ seedUrl: SEED, includePaths: ['^/item/'], excludePaths: ['^/item/private'] })
    expect(frontier.enqueue('https://fixture.test/item/1', 1).accepted).toBe(true)
    expect(frontier.enqueue('https://fixture.test/item/2?from=/about', 1).accepted).toBe(true)
    expect(frontier.enqueue('https://fixture.test/about', 1)).toMatchObject({ accepted: false, reason: 'path_denied' })
    expect(frontier.enqueue('https://fixture.test/item/private-3', 1)).toMatchObject({ accepted: false, reason: 'path_denied' })
    expect(frontier.pendingCount()).toBe(3)
  })

  it('matches a catastrophic path filter against a crafted path in linear time', () => {
    // A backtracking engine takes about 2^n steps for ^/(a+)+$ on "/" + n × "a" + "!".
    const frontier = seeded({ seedUrl: SEED, excludePaths: ['^/(a+)+$'] })
    for (const length of [32, 100_000]) {
      const started = performance.now()
      expect(frontier.enqueue(`https://fixture.test/${'a'.repeat(length)}!`, 1).accepted).toBe(true)
      expect(performance.now() - started).toBeLessThan(1_000)
    }
    expect(frontier.enqueue('https://fixture.test/aaaa', 1).reason).toBe('path_denied')
  })

  it('runs a filter the linear engine cannot run under a time limit, and skips the links it cannot decide', () => {
    const frontier = seeded({ seedUrl: SEED, includePaths: ['^/catalogue/(?!category/)[^/]+/index\\.html$'], excludePaths: ['^/(?!catalogue/)(a+)+$'] })
    expect(frontier.enqueue('https://fixture.test/catalogue/a-book_1/index.html', 1).accepted).toBe(true)
    expect(frontier.enqueue('https://fixture.test/catalogue/category/books_1/index.html', 1).reason).toBe('path_denied')
    const started = performance.now()
    expect(frontier.enqueue(`https://fixture.test/${'a'.repeat(40)}!`, 1).reason).toBe('path_undecided')
    // A filter that ran out of time decides nothing more, and does not run again.
    expect(frontier.enqueue('https://fixture.test/catalogue/b-book_2/index.html', 1).reason).toBe('path_undecided')
    expect(performance.now() - started).toBeLessThan(1_000)
    // A path longer than REGEX_SUBJECT_MAX_LENGTH is not run on the backtracking engine at all.
    const long = seeded({ seedUrl: SEED, includePaths: ['^/catalogue/(?!category/)[^/]+/index\\.html$'] })
    expect(long.enqueue(`https://fixture.test/catalogue/${'b'.repeat(3_000)}/index.html`, 1).reason).toBe('path_undecided')
    expect(long.enqueue('https://fixture.test/catalogue/c-book_3/index.html', 1).accepted).toBe(true)
  })

  it('does not enqueue sitemap XML as a discovery path of its own', () => {
    const frontier = seeded()
    expect(frontier.enqueue('https://fixture.test/sitemap.xml', 1).accepted).toBe(true)
    expect(frontier.pendingCount()).toBe(2)
  })

  it('counts the apex/www twin and the host the seed redirected to as the seed host', () => {
    const frontier = new Frontier({ seedUrl: 'https://example.com/' })
    frontier.seed()
    expect(frontier.enqueue('https://www.example.com/a', 1).accepted).toBe(true)
    expect(frontier.enqueue('https://docs.example.com/a', 1).reason).toBe('host_denied')
    expect(frontier.enqueue('https://example.org/a', 1).reason).toBe('host_denied')
    frontier.followSeedRedirect('https://www.example.org/home')
    expect(frontier.enqueue('https://www.example.org/a', 1).accepted).toBe(true)
    expect(frontier.enqueue('https://example.org/a', 1).accepted).toBe(true)
    expect(frontier.enqueue('https://cdn.example.org/a', 1).reason).toBe('host_denied')

    const www = new Frontier({ seedUrl: 'https://www.example.com/' })
    www.seed()
    expect(www.enqueue('https://example.com/b', 1).accepted).toBe(true)

    // An explicit allowlist adds to the seed host and its twin, which stay in scope.
    const listed = new Frontier({ seedUrl: 'https://example.com/', allowlistedDomains: ['partner.test'] })
    listed.seed()
    expect(listed.enqueue('https://www.example.com/a', 1).accepted).toBe(true)
    expect(listed.enqueue('https://partner.test/a', 1).accepted).toBe(true)
    expect(listed.enqueue('https://docs.example.com/a', 1).reason).toBe('host_denied')
  })

  it('does not enqueue image, font, style, script, media or program links; documents and the seed stay', () => {
    const frontier = seeded()
    for (const asset of ['/logo.PNG', '/img/photo.jpeg?w=200', '/fonts/a.woff2', '/site.css', '/app.js', '/clip.mp4', '/setup.exe']) {
      expect(frontier.enqueue(`https://fixture.test${asset}`, 1)).toMatchObject({ accepted: false, reason: 'asset_denied' })
    }
    for (const page of ['/report.pdf', '/data.csv', '/sheet.xlsx', '/api/data.json', '/archive.zip', '/feed.xml', '/page.html', '/docs/v1.2/']) {
      expect(frontier.enqueue(`https://fixture.test${page}`, 1).accepted).toBe(true)
    }
    expect(new Frontier({ seedUrl: 'https://fixture.test/logo.png' }).seed().accepted).toBe(true)
  })
})

describe('Frontier dequeue host limits', () => {
  it('honours DEFAULT_NETWORK_POLICY.perHostConcurrency = 2 after the min delay', () => {
    const frontier = new Frontier({ seedUrl: SEED })
    frontier.seed()
    frontier.enqueue('https://fixture.test/a', 1)
    frontier.enqueue('https://fixture.test/b', 1)

    const t0 = 1_000
    const delay = DEFAULT_NETWORK_POLICY.perHostMinDelayMs
    expect(frontier.dequeue(t0).item?.canonicalUrl).toBe(SEED)
    expect(frontier.dequeue(t0).item).toBeNull()
    // The seed's answer: this host's robots.txt sets no Crawl-delay.
    frontier.setCrawlDelay('fixture.test', null)
    expect(frontier.dequeue(t0 + delay).item?.canonicalUrl).toBe('https://fixture.test/a')
    expect(frontier.inFlightCount('fixture.test')).toBe(2)
    expect(frontier.dequeue(t0 + delay).item).toBeNull()
    expect(frontier.pendingCount()).toBe(1)

    frontier.release(SEED)
    expect(frontier.dequeue(t0 + delay * 2).item?.canonicalUrl).toBe('https://fixture.test/b')
  })

  it('waits perHostMinDelayMs = 250 before the next start on the same host', () => {
    const frontier = new Frontier({
      seedUrl: SEED,
      perHostConcurrency: 1,
      perHostMinDelayMs: 250,
    })
    frontier.seed()
    frontier.enqueue('https://fixture.test/a', 1)

    const t0 = 5_000
    expect(frontier.dequeue(t0).item?.canonicalUrl).toBe(SEED)
    frontier.release(SEED)

    const tooSoon = frontier.dequeue(t0 + 249)
    expect(tooSoon.item).toBeNull()
    expect(tooSoon.nextReadyAtMs).toBe(t0 + 250)

    const ready = frontier.dequeue(t0 + 250)
    expect(ready.item?.canonicalUrl).toBe('https://fixture.test/a')
  })

  it('uses robots crawlDelayMs when it is stricter than perHostMinDelayMs', () => {
    const frontier = new Frontier({
      seedUrl: SEED,
      perHostConcurrency: 1,
      perHostMinDelayMs: 250,
      crawlDelayMsByHost: new Map([['fixture.test', 2500]]),
    })
    frontier.seed()
    frontier.enqueue('https://fixture.test/a', 1)

    const t0 = 10_000
    expect(frontier.dequeue(t0).item).not.toBeNull()
    frontier.release(SEED)
    expect(frontier.hostDelayMs('fixture.test')).toBe(2500)
    expect(frontier.dequeue(t0 + 250).item).toBeNull()
    expect(frontier.dequeue(t0 + 2500).item?.canonicalUrl).toBe('https://fixture.test/a')
  })

  it('starts one page at a time on a host until a page there reports its robots.txt Crawl-delay', () => {
    const frontier = seeded()
    frontier.enqueue('https://fixture.test/a', 1)
    frontier.enqueue('https://fixture.test/b', 1)
    const t0 = 1_000
    expect(frontier.dequeue(t0).item?.canonicalUrl).toBe(SEED)
    expect(frontier.dequeue(t0 + 250).item).toBeNull()
    frontier.setCrawlDelay('fixture.test', 1_000)
    expect(frontier.dequeue(t0 + 250).item).toBeNull()
    expect(frontier.dequeue(t0 + 1_000).item?.canonicalUrl).toBe('https://fixture.test/a')
    expect(frontier.crawlDelayMs('fixture.test')).toBe(1_000)
    expect(frontier.crawlDelayMs('other.test')).toBeNull()
  })

  it('drops pending pages its admit test refuses without starting them or delaying the host', () => {
    const frontier = seeded({ seedUrl: SEED, perHostConcurrency: 1, perHostMinDelayMs: 1_000 })
    frontier.enqueue('https://fixture.test/a', 1)
    frontier.enqueue('https://fixture.test/b', 1)
    const admit = (item: { canonicalUrl: string }) => item.canonicalUrl !== 'https://fixture.test/a'
    const t0 = 1_000
    expect(frontier.dequeue(t0, admit)).toMatchObject({ item: { canonicalUrl: SEED }, refused: 0, previousStartAtMs: null })
    frontier.release(SEED)
    frontier.setCrawlDelay('fixture.test', null)
    expect(frontier.dequeue(t0 + 1, admit)).toEqual({ item: null, nextReadyAtMs: t0 + 1_000, refused: 1, previousStartAtMs: null })
    expect(frontier.pendingCount()).toBe(1)
    expect(frontier.dequeue(t0 + 1_000, admit)).toMatchObject({ item: { canonicalUrl: 'https://fixture.test/b' }, previousStartAtMs: t0 })
  })

  it('lets a second host proceed while the first is at concurrency', () => {
    const frontier = new Frontier({
      seedUrl: 'https://a.test/',
      allowlistedDomains: ['a.test', 'b.test'],
      perHostConcurrency: 1,
      perHostMinDelayMs: 250,
    })
    frontier.seed('https://a.test/')
    frontier.enqueue('https://b.test/', 0)

    const t0 = 1
    expect(frontier.dequeue(t0).item?.host).toBe('a.test')
    expect(frontier.dequeue(t0).item?.host).toBe('b.test')
  })
})

describe('Frontier does not fetch', () => {
  it('exports only the queue, not a scrape subject', async () => {
    const frontier = await import('../src/frontier.js')
    expect(Object.keys(frontier)).toEqual(['Frontier'])
  })
})
