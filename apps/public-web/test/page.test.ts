import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { archivedSectionsMarkup } from '../src/archive/landingSections.js'
import { CAPABILITIES, clientCopy, CLIENTS } from '../src/featureSections.js'
import { glyphBand } from '../src/glyphArt.js'
import { FAQ, faqJsonLd, pageMarkup, sectionBar } from '../src/page.js'
import { REAL_SITE_MISSES, REAL_SITE_RUN } from '../src/realSiteRun.js'

describe('Page markup', () => {
  it('numbers the section bars in page order', () => {
    const bars = [...pageMarkup().matchAll(/<b>(\d\d)<\/b> \/ (\d\d) \]<\/span><span>·<\/span><span class="section-bar-label">([^<]+)</g)]
    expect(bars.map(([, n, total, label]) => `${n}/${total} ${label}`)).toEqual(['01/03 WHAT IT DOES', '02/03 GET STARTED', '03/03 FAQ'])
    expect(sectionBar('faq')).toContain('aria-hidden="true"')
  })

  it('is a tool page: the hero, what it does, get started, then the FAQ last', () => {
    const page = pageMarkup()
    const sections = [...page.matchAll(/<section class="[^"]*" id="([^"]+)"/g)].map(([, id]) => id)
    expect(sections).toEqual(['result-section', 'what-it-does', 'get-started', 'faq'])
    for (const [, target] of page.matchAll(/href="#([^"]+)"/g)) expect(page).toContain(`id="${target}"`)
  })

  it('writes no style attribute, which the site’s Content-Security-Policy (style-src \'self\') would drop', () => {
    expect(pageMarkup()).not.toMatch(/\sstyle="/)
  })

  it('gives only the Get started cloud the sea’s weather', () => {
    const clouds = [...pageMarkup().matchAll(/<pre class="glyph-cloud[^"]*"[^>]*>/g)].map(([tag]) => tag)
    expect(clouds).toHaveLength(2)
    expect(clouds.filter(tag => tag.includes(' data-weather '))).toEqual(['<pre class="glyph-cloud" data-cols="150" data-rows="30" data-seed="11" data-weather aria-hidden="true">'])
  })

  it('gives search engines the FAQ the page shows, as FAQPage data that cannot close its script', () => {
    const script = faqJsonLd()
    const json = script.replace(/^<script type="application\/ld\+json">/, '').replace(/<\/script>$/, '')
    expect(json).not.toContain('<')
    const data = JSON.parse(json) as { '@type': string, mainEntity: Array<{ name: string, acceptedAnswer: { text: string } }> }
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity.map(item => item.name)).toEqual(FAQ.map(([question]) => question))
    expect(data.mainEntity[1]!.acceptedAnswer.text).toContain('Amazon.sg product pages (/dp/ASIN) are in Beta.')
    expect(pageMarkup().match(/<details class="faq-item">/g)).toHaveLength(FAQ.length)
  })

  it('marks only links that leave the site with an arrow in the header', () => {
    const header = pageMarkup().split('</header>')[0]!
    expect(header.match(/↗/g)).toHaveLength(1)
    expect(header).toMatch(/github\.com\/77777R7\/Octocrawl[^]*?↗/)
  })

  it('links the brand to the home page and keeps the header octopus still', () => {
    const page = pageMarkup()
    expect(page.match(/<a class="brand[^"]*" href="\/" aria-label="Octocrawl home">/g)).toHaveLength(2)
    expect(page).not.toContain('class="brand" href="#top"')
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    expect(css).not.toMatch(/octo-(drift|wiggle)/)
    const wordmark = readFileSync(new URL('../public/assets/octocrawl-wordmark.svg', import.meta.url), 'utf8')
    expect(wordmark).not.toContain('#ff8659')
  })

  it('keeps the crawl window inside the URL card, hidden until a run opens it, with a way to skip it', () => {
    const card = /<div class="url-card">([\s\S]*?)<p class="form-message"/.exec(pageMarkup())?.[1] ?? ''
    expect(card).toContain('<div class="crawl-window" id="crawl-window" hidden>')
    expect(card).toContain('<button class="crawl-skip" id="crawl-skip" type="button">')
    expect(card).toContain('<canvas class="crawl-canvas" aria-hidden="true">')
  })

  it('writes the same glyph band on every build, thinning out row by row', () => {
    expect(glyphBand()).toBe(glyphBand())
    const rows = glyphBand().split('\n')
    expect(rows).toHaveLength(4)
    const ink = rows.map((row) => row.replace(/ /g, '').length)
    expect(ink[0]).toBeGreaterThan(ink[1])
    expect(ink[1]).toBeGreaterThan(ink[2])
    expect(ink[2]).toBeGreaterThan(ink[3])
  })

  it('lists each recorded run once for readers and once more, hidden, for the loop', () => {
    const page = archivedSectionsMarkup()
    expect(page.match(/linkedin\.com\/feed — blocked at the robots\.txt check/g)).toHaveLength(2)
    expect(page).toContain('<ul class="ticker-list" aria-hidden="true">')
  })

  it('draws one cell per case of the cited run, and the three misses are exactly the cases that did not pass', () => {
    expect(REAL_SITE_RUN).toHaveLength(106)
    const missed = REAL_SITE_RUN.filter(([, , checks]) => checks === 'skipped' || checks.split('/')[0] !== checks.split('/')[1]).map(([id]) => id)
    expect(missed).toEqual(Object.keys(REAL_SITE_MISSES))
    expect(106 - missed.length).toBe(103)
    const page = archivedSectionsMarkup()
    expect(page.match(/<li class="run-cell/g)).toHaveLength(106)
    expect(page.match(/<li class="run-cell is-miss/g)).toHaveLength(3)
  })

  it('compares the tools with the numbers recorded in the benchmark notes', () => {
    const page = archivedSectionsMarkup()
    for (const value of ['66.1%', '32.1%', '14.3%', '0.0%', '67.9%', '81.8%']) expect(page).toContain(`>${value}</span>`)
    expect(page).toContain('CI run 35423895294 · main@6dc2e6e')
  })

  it('marks as hosted only what hosted Octocrawl serves: scrape and map, and crawl and batch jobs for an account', () => {
    const hostedApi = readFileSync(new URL('../../../packages/mcp/src/hostedApi.ts', import.meta.url), 'utf8')
    expect(hostedApi).toContain("(path === '/v1/scrape' || path === '/v1/map')")
    expect(hostedApi).toContain("(path === '/v1/batches' || path === '/v1/crawl')")
    expect(CAPABILITIES.filter(c => c.hosted).map(c => c.key)).toEqual(['scrape', 'map', 'crawl', 'batch'])
    const page = pageMarkup()
    expect(page.match(/<li class="can-cell" data-hosted="true">/g)).toHaveLength(4)
    expect(page.match(/<li class="can-cell" data-hosted="false">/g)).toHaveLength(2)
    expect(page).toContain('Hosted <span class="can-count">4</span>')
  })

  it('says what each capability does in a few short points', () => {
    const page = pageMarkup()
    for (const c of CAPABILITIES) {
      expect(c.points.length).toBeGreaterThanOrEqual(2)
      expect(c.points.length).toBeLessThanOrEqual(3)
      for (const point of c.points) expect(point.length).toBeLessThanOrEqual(70)
      expect(page).toContain(`<ul class="can-points" role="list">${c.points.map(p => `<li>${p}</li>`).join('')}</ul>`)
    }
  })

  it('states in the limits doc the free allowances the services enforce', () => {
    const hostedApi = readFileSync(new URL('../../../packages/mcp/src/hostedApi.ts', import.meta.url), 'utf8')
    const constant = (name: string) => Number(new RegExp(`export const ${name} = ([\\d_]+)`).exec(hostedApi)?.[1]?.replace(/_/g, ''))
    const limits = readFileSync(new URL('../content/limits.md', import.meta.url), 'utf8')
    expect(limits).toContain(`${constant('DEFAULT_KEYLESS_DAILY')} pages a day per address`)
    expect(limits).toContain('The account\'s credits: 1,000 a month')
    const site = constant('DEFAULT_SITE_DAILY').toLocaleString('en-US')
    const accounts = constant('DEFAULT_ACCOUNTS_DAILY').toLocaleString('en-US')
    expect(limits).toContain(`Callers without an account share ${site} pages a day for the whole service; accounts have ${accounts} a day of their own, at most ${constant('DEFAULT_ACCOUNT_DAILY')} an account`)
  })

  it('shows every way in without a script, and keeps the controls that need one hidden until it runs', () => {
    const page = pageMarkup()
    expect(page).toContain('<div class="use-tabs" role="tablist" aria-label="Use Octocrawl from" hidden>')
    expect(page).toContain('<button class="use-copy" type="button" id="use-copy" hidden>')
    expect(page).toContain('<fieldset class="can-filter" hidden>')
    expect(page).not.toMatch(/class="use-panel"[^>]* hidden/)
    expect(page.match(/<p class="use-panel-label" aria-hidden="true">/g)).toHaveLength(CLIENTS.length)
  })

  it('gives every way in a tab and one panel, with the first selected and the code to copy as written', () => {
    const page = pageMarkup()
    for (const [i, c] of CLIENTS.entries()) {
      expect(page).toContain(`id="use-tab-${c.key}" aria-controls="use-panel-${c.key}" aria-selected="${i === 0}"`)
      expect(page).toMatch(new RegExp(`id="use-panel-${c.key}" aria-labelledby="use-tab-${c.key}" data-title="[^"<>]+" data-copy="[^"<>]+">`))
    }
    const copy = (key: string) => clientCopy(CLIENTS.find(c => c.key === key)!)
    // Copy takes the commands and code as they were run, never comments, output or the agent prompt.
    expect(copy('cli').split('\n')).toEqual([
      'npx octocrawl scrape https://example.com --markdown',
      'npx octocrawl map https://example.com',
      'npx octocrawl batch https://example.com https://example.org --out results',
      'ls results',
    ])
    expect(copy('mcp')).toBe('claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp')
    expect(copy('ts').split('\n')[0]).toBe("import { W2L } from '@octocrawl/sdk'")
    expect(copy('py').split('\n')[0]).toBe('from octocrawl_client import W2L')
    expect(copy('rest')).toContain('https://api.octocrawl.dev/v1/scrape')
    expect(copy('rest')).not.toMatch(/^#/m)
  })

  it('gives an email and GitHub as contacts in the footer', () => {
    const page = pageMarkup()
    expect(page).toContain('href="mailto:hello@octocrawl.dev"')
    expect(page).toContain('href="https://github.com/77777R7/Octocrawl/issues"')
  })
})
