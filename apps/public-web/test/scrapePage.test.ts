import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blogPath, posts } from '../scripts/blogPosts.mjs'
import { pages } from '../scripts/docsPages.mjs'
import { NAV_CAPABILITIES } from '../scripts/siteNav.mjs'
import { scrapeSnippet } from '../src/product/scrapeCode'
import { gridRows } from '../src/product/scrapeDrop'
import { SCRAPE_DESCRIPTION, SCRAPE_FAQ, SCRAPE_PATH, SCRAPE_TITLE, scrapeJsonLd, scrapePageMarkup } from '../src/product/scrapePage'
import { DEMOS, DOCS, DOCS_CELL, DOCS_SAMPLE, HARD, WIKIPEDIA_REQUEST } from '../src/product/scrapeRun'

// /scrape/: three scrapes recorded on hosted Octocrawl (src/product/scrapeRun.ts) in the hero, then harder pages, the
// Evidence Record's hash check, the code, the cost and the FAQ.
const app = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
const markup = scrapePageMarkup()
const ids = (html: string) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id!))

describe('the /scrape/ product page', () => {
  it('is built, linked from the Product menu and listed in the sitemap', () => {
    const entry = readFileSync(app('scrape/index.html'), 'utf8')
    expect(entry).toContain('<script type="module" src="/src/product/scrapeMain.ts"></script>')
    expect(entry).toContain(`<title>${SCRAPE_TITLE}</title>`)
    expect(entry).toContain(`<meta name="description" content="${SCRAPE_DESCRIPTION}" />`)
    expect(entry).toContain('<meta property="og:image" content="__W2L_ORIGIN__/assets/og-scrape.jpg" />')
    expect(existsSync(app('public/assets/og-scrape.jpg'))).toBe(true)
    // The hero's artwork is the road scene's, preloaded and versioned like the tool pages' coast.
    expect(entry).toContain('<link rel="preload" as="image" href="/assets/scene-road.webp" />')
    expect(existsSync(app('public/assets/scene-road.webp'))).toBe(true)
    expect(markup).toContain('<div class="pd-art" data-art="road" aria-hidden="true"><div class="hero-backdrop"></div><div class="hero-glyphs"></div></div>')
    expect(SCRAPE_TITLE.length).toBeLessThanOrEqual(60)
    expect(readFileSync(app('vite.config.ts'), 'utf8')).toContain('./scrape/index.html')
    expect(readFileSync(app('scripts/build-docs.mjs'), 'utf8')).toContain(`const SCRAPE_PATH = '${SCRAPE_PATH}'`)
    expect(NAV_CAPABILITIES.find(item => item.title === 'Scrape a page')?.href).toBe(SCRAPE_PATH)
  })

  it('shows the three recorded pages: the start of each one’s raw HTML and Markdown from one read', () => {
    expect(DEMOS.map(d => d.url)).toEqual(['https://en.wikipedia.org/wiki/Octopus', 'https://docs.python.org/3/library/datetime.html', 'https://www.amazon.sg/dp/0135957052'])
    for (const d of DEMOS) {
      expect(markup).toContain(`id="dm-pane-${d.id}"`)
      expect(d.rawHead.length).toBe(4200)
      expect(d.markdownHead.split('\n')).toHaveLength(60)
    }
    expect(DEMOS[0]!.markdownHead.startsWith('# Octopus\n')).toBe(true)
    expect(markup.match(/class="dm-pane"/g)).toHaveLength(3)
    expect(markup.match(/class="ft-hard"/g)).toHaveLength(HARD.length)
  })

  it('lays the raw HTML and the Markdown on the octopus’s grid as the pane shows them', () => {
    expect(gridRows('<a  href="x">\n\n<b>', 8, false)).toEqual(['<a href=', '"x">', '<b>'])
    expect(gridRows('# Octopus\n\nAn **octopus**', 20, true)).toEqual(['# Octopus', '', 'An **octopus**'])
  })

  it('hashes the docs page as recorded: the served copy is the bytes that were read, with one cell to change', () => {
    const sample = readFileSync(app(`public${DOCS_SAMPLE}`))
    expect(sample.length).toBe(DOCS.bytes)
    expect(createHash('sha256').update(sample).digest('hex')).toBe(DOCS.rawSha256)
    const text = sample.toString('utf8')
    // The section finds the cell by this whole run of bytes, so it must occur once, in the format-code table's first row.
    const marker = DOCS_CELL.before + DOCS_CELL.value + DOCS_CELL.after
    const at = text.indexOf(marker)
    expect(at).toBeGreaterThan(text.indexOf('format codes that the 2011 C standard'))
    expect(text.indexOf(marker, at + 1)).toBe(-1)
    // The hash box claims nothing before it has hashed.
    expect(markup).toContain('id="ft-hash" aria-live="polite">not computed yet</dd>')
    expect(markup).not.toContain('ft-verdict is-match')
  })

  it('has no inline styles, unique ids, its FAQ as structured data, and links only to places that exist', () => {
    expect(markup).not.toContain('style=')
    const all = [...markup.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id!)
    expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([])
    expect(markup.match(/<details class="faq-item">/g)).toHaveLength(SCRAPE_FAQ.length)
    const data = JSON.parse(scrapeJsonLd().replace(/^<script[^>]*>|<\/script>$/g, ''))
    expect(data).toMatchObject({ '@type': 'FAQPage' })
    expect(data.mainEntity).toHaveLength(SCRAPE_FAQ.length)
    const own = ids(markup)
    for (const [, hash] of markup.matchAll(/href="#([a-z-]+)"/g)) expect([hash, own.has(hash!)]).toEqual([hash, true])
    const docs = new Set(pages.map(page => (page.slug ? `/docs/${page.slug}/` : '/docs/')))
    const blog = new Set(posts.map(post => blogPath(post)))
    const body = markup.slice(markup.indexOf('</header>'), markup.indexOf('<footer'))
    for (const [, href] of body.matchAll(/href="(\/[^"]*)"/g)) {
      const path = href!.split('#')[0]!
      expect([path, docs.has(path) || blog.has(path) || path === '/' || existsSync(app(`${path.slice(1)}index.html`))]).toEqual([path, true])
    }
  })

  it('writes the Wikipedia read as the call it was', () => {
    expect(scrapeSnippet('curl')).toContain(`-d '${JSON.stringify(WIKIPEDIA_REQUEST)}'`)
    expect(markup).toContain('api.octocrawl.dev/v1/scrape')
    expect(scrapeSnippet('cli')).toBe(`npx octocrawl scrape '${WIKIPEDIA_REQUEST.url}' --formats '${JSON.stringify(WIKIPEDIA_REQUEST.formats)}'`)
    expect(scrapeSnippet('py')).toContain('formats=["markdown", "links", "tables", {"type": "json"')
    expect(scrapeSnippet('ts')).toContain("new W2L({ baseUrl: 'http://127.0.0.1:8787' })")
    expect(scrapeSnippet('mcp')).toContain('kingdom, phylum, class, order')
  })

  it('hands a reader’s URL to the free tool page, which runs it only when this tab asked', () => {
    const main = readFileSync(app('src/main.ts'), 'utf8')
    expect(main).toContain("new URLSearchParams(window.location.search).get('url')")
    expect(main).toContain("sessionStorage.getItem('w2l:handoff') === handed")
    expect(readFileSync(app('src/product/scrapeFeatures.ts'), 'utf8')).toContain("sessionStorage.setItem('w2l:handoff', url)")
  })
})
