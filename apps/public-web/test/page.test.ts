import { describe, expect, it } from 'vitest'
import { archivedSectionsMarkup } from '../src/archive/landingSections.js'
import { glyphBand } from '../src/glyphArt.js'
import { pageMarkup, sectionBar } from '../src/page.js'
import { REAL_SITE_MISSES, REAL_SITE_RUN } from '../src/realSiteRun.js'

describe('Page markup', () => {
  it('numbers the section bars in page order', () => {
    const bars = [...pageMarkup().matchAll(/<b>(\d\d)<\/b> \/ (\d\d) \]<\/span><span>·<\/span><span class="section-bar-label">([^<]+)</g)]
    expect(bars.map(([, n, total, label]) => `${n}/${total} ${label}`)).toEqual(['01/02 HOW IT WORKS', '02/02 FAQ'])
    expect(sectionBar('faq')).toContain('aria-hidden="true"')
  })

  it('is a tool page: the hero, how it works, then the FAQ last', () => {
    const page = pageMarkup()
    const sections = [...page.matchAll(/<section class="[^"]*" id="([^"]+)"/g)].map(([, id]) => id)
    expect(sections).toEqual(['result-section', 'how-it-works', 'faq'])
    for (const [, target] of page.matchAll(/href="#([^"]+)"/g)) expect(page).toContain(`id="${target}"`)
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

  it('gives an email and GitHub as contacts in the footer', () => {
    const page = pageMarkup()
    expect(page).toContain('href="mailto:hello@octocrawl.dev"')
    expect(page).toContain('href="https://github.com/77777R7/w2l/issues"')
  })
})
