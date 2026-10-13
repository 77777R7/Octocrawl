import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blogPath, posts } from '../scripts/blogPosts.mjs'
import { DASHBOARD_PAGES } from '../scripts/dashboardPages.mjs'
import { pages } from '../scripts/docsPages.mjs'
import { NAV_TOOLS } from '../scripts/siteNav.mjs'
import { SCENES, sceneName } from '../src/heroArtwork'
import { pageMarkup } from '../src/page'
import { csvCell } from '../src/tools/mapResults'
import { TOOL_PAGES } from '../src/tools/pages'
import { toolPageJsonLd, toolPageMarkup, toolPagePath } from '../src/tools/toolPage'
import { TOOLS, toolPath } from '../src/tools/toolSections'

// The free tools' pages: the home page's card under a short strip of the coast, run by the home page's script
// (main.ts) and set up for the tool, and the free tools' sections below.
const app = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
const ids = (html: string) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id!))
const main = readFileSync(app('src/main.ts'), 'utf8')
const required = [...main.matchAll(/document\.querySelector<[^>]+>\('#([a-z0-9-]+)'\)!/g)].map(([, id]) => id!)

describe('the free tools’ pages', () => {
  it('list every live tool of the hub, and only those', () => {
    expect(TOOL_PAGES.map(page => toolPagePath(page)).sort()).toEqual(TOOLS.filter(tool => tool.live).map(toolPath).sort())
  })

  for (const page of TOOL_PAGES) {
    const markup = toolPageMarkup(page)
    const path = toolPagePath(page)
    describe(page.name, () => {
      it('has every element the home page’s script needs, from its own built entry, in the sitemap and the menu', () => {
        expect(required.length).toBeGreaterThan(30)
        const home = ids(pageMarkup())
        const tool = ids(markup)
        for (const id of required) expect([id, home.has(id) && tool.has(id)]).toEqual([id, true])
        const entry = readFileSync(app(`${path.slice(1)}index.html`), 'utf8')
        expect(entry).toContain('<script type="module" src="/src/main.ts"></script>')
        expect(entry).toContain(`<title>${page.docTitle}</title>`)
        // Whole in a search result: about 60 characters fit.
        expect(page.docTitle.length).toBeLessThanOrEqual(60)
        expect(entry).toContain(`<meta name="description" content="${page.description}" />`)
        expect(entry).toContain(`<link rel="canonical" href="__W2L_ORIGIN__${path}" />`)
        // Its own link preview, a 1200×630 picture of its top.
        expect(entry).toContain(`<meta property="og:image" content="__W2L_ORIGIN__/assets/og-${page.slug}.jpg" />`)
        expect(existsSync(app(`public/assets/og-${page.slug}.jpg`))).toBe(true)
        expect(readFileSync(app('scripts/build-docs.mjs'), 'utf8')).toContain(`['${path}', '`)
        expect(NAV_TOOLS.some(item => item.href === path)).toBe(true)
      })

      it('shows a strip of the coast, not the home page’s artwork, with its breadcrumb and presets', () => {
        expect(markup).toContain('<div class="hero is-tool" id="top" data-art="coast"')
        for (const id of ['hero-ascii', 'hero-glyphs', 'hero-click-spark']) expect(markup).not.toContain(`id="${id}"`)
        expect(markup).toContain(`<nav class="tool-crumbs" aria-label="Breadcrumb"><a href="/tools/">Free tools</a><span aria-hidden="true">/</span><span aria-current="page">${page.hero.tool.crumb}</span></nav>`)
        expect(markup).toContain(`<h1 id="hero-title">${page.hero.title}</h1>`)
        const { view, example, text } = page.hero.tool
        expect(markup.includes(`data-tool-view="${view}"`)).toBe(Boolean(view))
        expect(markup.includes(`data-tool-example="${example}"`)).toBe(Boolean(example))
        expect(markup.includes('data-tool-text="on"')).toBe(Boolean(text))
        expect(readFileSync(app(`${path.slice(1)}index.html`), 'utf8')).toContain('<link rel="preload" as="image" href="/assets/scene-coast.webp" />')
      })

      it('has no inline styles, unique ids, its FAQ and structured data, and links only to places that exist', () => {
        expect(markup).not.toContain('style=')
        const all = [...markup.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id!)
        expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([])
        expect(markup.match(/<details class="faq-item">/g)).toHaveLength(page.faq.length)
        expect(JSON.parse(toolPageJsonLd(page).replace(/^<script[^>]*>|<\/script>$/g, ''))).toMatchObject({ '@type': 'SoftwareApplication', url: `__W2L_ORIGIN__${path}`, offers: { price: '0' } })
        const own = ids(markup)
        for (const [, hash] of markup.matchAll(/href="#([a-z-]+)"/g)) expect([hash, own.has(hash!)]).toEqual([hash, true])
        const docs = new Set(pages.map(doc => (doc.slug ? `/docs/${doc.slug}/` : '/docs/')))
        const blog = new Set(posts.map(post => blogPath(post)))
        const sections = markup.slice(markup.indexOf('id="how"'), markup.indexOf('<footer'))
        for (const [, href] of sections.matchAll(/href="(\/[^"]*)"/g)) {
          const target = href!.split('#')[0]!
          // A docs page, a blog article, the sign-in or a dashboard page, or a page Vite builds (the hub, a tool, a product page).
          const built = existsSync(app(`${target.slice(1)}index.html`))
          expect([target, docs.has(target) || blog.has(target) || target === '/signin/' || DASHBOARD_PAGES.some(([dash]) => dash === target) || built]).toEqual([target, true])
        }
      })
    })
  }

  it('give Link Extractor a Whole site / This page switch and a place for the site’s pages, at the path the blog links to', () => {
    const page = TOOL_PAGES.find(tool => tool.slug === 'link-extractor')!
    expect(toolPagePath(page)).toBe('/tools/link-extractor/')
    const markup = toolPageMarkup(page)
    expect(markup).toContain('data-tool-map="site"')
    expect(markup).toContain('<button type="button" role="radio" aria-checked="true" data-map-mode="site">Whole site</button>')
    expect(markup).toContain('<section class="map-section" id="map-section" aria-labelledby="map-title" hidden>')
    expect(markup.indexOf('id="map-section"')).toBeLessThan(markup.indexOf('id="how"'))
    expect(markup).toContain('href="/blog/find-all-pages-on-a-website/"')
    expect(main).toContain('if (hero.dataset.toolMap) mountMapResults(hero, form, input, normalizeUrl')
    expect(readFileSync(app('src/tools/mapResults.ts'), 'utf8')).toContain("fetch('/api/map'")
    // A title a site wrote reaches the CSV as text: never a formula a spreadsheet would run.
    expect(['=HYPERLINK("https://evil/","x")', '+1', '-1', '@sum', 'a,b', 'plain'].map(csvCell)).toEqual([`"'=HYPERLINK(""https://evil/"",""x"")"`, "'+1", "'-1", "'@sum", '"a,b"', 'plain'])
  })

  it('leave the home page its mountain, and paint the coast from one file', () => {
    expect(pageMarkup()).toContain('<div class="hero" id="top">')
    expect([sceneName('coast'), sceneName(undefined), sceneName('elsewhere')]).toEqual(['coast', 'mountain', 'mountain'])
    const coast = '/assets/scene-coast.webp'
    expect(SCENES.coast.art.split('?')[0]).toBe(coast)
    expect(readFileSync(app('src/styles.css'), 'utf8')).toContain(`.hero[data-art='coast'] .hero-backdrop { background-image: url('${coast}');`)
    for (const scene of Object.values(SCENES)) expect(existsSync(app(`public${scene.art.split('?')[0]}`))).toBe(true)
    const { land } = SCENES.coast
    expect([land(1360, 520), land(1560, 600), land(1600, 900)].map(Math.round)).toEqual([1, 1, 1])
    expect([land(1380, 700), land(1200, 800), land(800, 300), land(1450, 360)].map(Math.round)).toEqual([0, 0, 0, 0])
  })
})
