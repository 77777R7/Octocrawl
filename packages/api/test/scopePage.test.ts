import { describe, expect, it } from 'vitest'
import { scopePage } from '../src/scopePage.js'

const page = (hosts: string[], task = 'read one page') => scopePage({ task, hosts })

describe('the page that asks the person to allow sites', () => {
  // On 2026-11-07 the page in a dark Chrome showed two buttons on black: its text had a colour of its own and no background.
  it('brings its own background, so its text shows in a dark Chrome and a light one', () => {
    const html = page(['site.test'])
    expect(html).toMatch(/html\{[^}]*background:#071b4f/)
    expect(html).toMatch(/\.card\{[^}]*background:#fff/)
    expect(html).toContain('color-scheme:dark')
  })

  it('names the task and every site, and escapes them', () => {
    const html = page(['a.test', 'b.test:8080', '<img src=x>'], 'read "<b>this</b>"')
    expect(html).toContain('<code>a.test</code>')
    expect(html).toContain('<code>b.test:8080</code>')
    expect(html).not.toContain('<img src=x>')
    expect(html).not.toContain('<b>this</b>')
  })

  it('says how many sites, since a long list scrolls', () => {
    expect(page(['a.test'])).toContain('1 site it may read')
    expect(page(Array.from({ length: 40 }, (_, i) => `s${i}.test`))).toContain('40 sites it may read')
  })

  it('wires its buttons before anything that draws, so a drawing failure leaves them working', () => {
    const html = page(['site.test'])
    expect(html.indexOf("getElementById('allow').onclick")).toBeGreaterThan(-1)
    expect(html.indexOf("getElementById('allow').onclick")).toBeLessThan(html.indexOf("getElementById('field')"))
    expect(html).toContain('<button id="revoke">Revoke</button>')
    expect(html).toContain('<button id="allow">Allow reading these sites</button>')
  })

  it('loads nothing from the network', () => {
    expect(page(['site.test'])).not.toMatch(/(?:src|href)="?https?:|url\(http|@import/)
  })
})
