import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pages } from '../scripts/docsPages.mjs'
import { NAV_CAPABILITIES, siteActionsMarkup, siteNavMarkup } from '../scripts/siteNav.mjs'
import { CAPABILITIES } from '../src/featureSections.js'
import { pageMarkup } from '../src/page.js'

const app = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
// The heading ids build-docs.mjs gives a page's sections.
const headingIds = (file: string) => [...readFileSync(app(`content/${file}`), 'utf8').matchAll(/^#{1,6} (.+)$/gm)]
  .map(([, title]) => title!.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/\s+/g, '-'))

describe('Top navigation', () => {
  it('leads only to places that exist: docs pages and their sections, home page sections, the changelog', () => {
    const home = pageMarkup()
    const hrefs = [...`${siteNavMarkup()}${siteActionsMarkup()}`.matchAll(/href="([^"]+)"/g)].map(([, href]) => href!)
    expect(hrefs.length).toBeGreaterThan(20)
    for (const href of hrefs) {
      if (href.startsWith('https://')) { expect(href).toBe('https://github.com/77777R7/Octocrawl'); continue }
      const [path, hash] = href.split('#') as [string, string | undefined]
      if (path === '/') { expect([href, home.includes(`id="${hash}"`)]).toEqual([href, true]); continue }
      if (path === '/changelog/') { expect(existsSync(app('../../CHANGELOG.md'))).toBe(true); continue }
      if (path === '/llms.txt') continue
      const page = pages.find(p => (p.slug ? `/docs/${p.slug}/` : '/docs/') === path)
      expect([href, page?.file]).toEqual([href, expect.any(String)])
      if (hash) expect([href, headingIds(page!.file).includes(hash)]).toEqual([href, true])
    }
  })

  it('lists what the home page says Octocrawl does, and every guide and reference page', () => {
    expect(NAV_CAPABILITIES).toHaveLength(CAPABILITIES.length)
    const nav = siteNavMarkup()
    for (const page of pages.filter(p => p.group !== 'Project')) expect(nav).toContain(`>${page.title}<`)
  })

  it('works without a script: menus are <details>, and the phone menu button stays hidden until nav.js shows it', () => {
    const nav = siteNavMarkup()
    expect(nav.match(/<details class="nav-drop">/g)).toHaveLength(2)
    expect(nav).toMatch(/<button class="nav-toggle"[^>]* hidden>/)
    expect(pageMarkup()).toContain(nav)
    const html = readFileSync(app('index.html'), 'utf8')
    expect(html).toContain('href="/docs-assets/nav.css"')
    expect(html).toContain('src="/docs-assets/nav.js"')
  })

  it('marks the page being read', () => {
    expect(siteNavMarkup('docs')).toMatch(/<summary aria-current="page">Docs/)
    expect(siteNavMarkup('changelog')).toContain('href="/changelog/" aria-current="page"')
    expect(siteNavMarkup()).not.toContain('aria-current')
  })
})
