import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blogPath, posts } from '../scripts/blogPosts.mjs'
import { pages } from '../scripts/docsPages.mjs'
import { DASHBOARD_PAGES } from '../scripts/dashboardPages.mjs'
import { NAV_CAPABILITIES } from '../scripts/siteNav.mjs'
import { scrapeSnippet } from '../src/product/scrapeCode'
import { gridRows } from '../src/product/scrapeDrop'
import { foldMarkdown, foldedText } from '../src/product/scrapeMarkdown'
import { FORMAT_CARDS, SCRAPE_DESCRIPTION, SCRAPE_FAQ, SCRAPE_PATH, SCRAPE_TITLE, scrapeJsonLd, scrapePageMarkup } from '../src/product/scrapePage'
import { AMAZON_FIELDS, CARD_MARKDOWN, DATETIME_TABLE, DEMOS, DOCS, DOCS_CELL, DOCS_SAMPLE, HARD, OCTOPUS_SIZES, WIKIPEDIA_REQUEST } from '../src/product/scrapeRun'

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
    // Each tab shows its site's own icon, served from this site (the CSP allows images from 'self' only).
    for (const id of ['wikipedia', 'docs', 'amazon']) expect([id, existsSync(app(`public/assets/sites/${id}.png`))]).toEqual([id, true])
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
      expect(d.rawHead.length).toBe(6000)
      expect(d.includeTags.length).toBeGreaterThan(0)
      expect(d.markdownHead.split('\n')).toHaveLength(Math.min(60, d.markdownLines))
    }
    expect(DEMOS[0]!.markdownHead.startsWith('# Octopus\n')).toBe(true)
    expect(markup.match(/class="dm-pane"/g)).toHaveLength(3)
    expect(markup.match(/class="ft-hard"/g)).toHaveLength(HARD.length)
  })

  it('opens What you get with the banner, then one item and one card per format, in the same order', () => {
    expect(markup.indexOf('id="what-you-get"')).toBeGreaterThan(markup.indexOf('id="demo"'))
    expect(markup.indexOf('id="what-you-get"')).toBeLessThan(markup.indexOf('id="harder"'))
    expect(markup).toContain('<div class="fx-light" aria-hidden="true"></div>')
    expect(markup.match(/class="fx-item[ "]/g)).toHaveLength(FORMAT_CARDS.length)
    expect(markup.match(/<figure class="fx-card /g)).toHaveLength(FORMAT_CARDS.length)
    FORMAT_CARDS.forEach((c, i) => {
      expect(markup).toContain(`aria-controls="fx-card-${c.id}">${c.title}</button>`)
      expect(markup).toContain(`id="fx-card-${c.id}" data-step="${i}"`)
    })
    // Narrow screens put each card after its words by these orders (product.css), one pair per format.
    const css = readFileSync(app('src/product/product.css'), 'utf8')
    FORMAT_CARDS.forEach((_, i) => expect(css).toContain(`.fx-item[data-step="${i}"] { order: ${2 * i}; } .fx-card[data-step="${i}"] { order: ${2 * i + 1}; }`))
  })

  it('shows the recorded numbers on the format cards', () => {
    // 922,203 bytes of HTML; 158,375 of Markdown for the whole page, 62,302 with the hero's includeTags (same bytes read).
    expect(OCTOPUS_SIZES).toEqual({ rawBytes: 922_203, markdownBytes: 158_375, selectedBytes: 62_302 })
    expect(markup).toContain('<b>83%</b> smaller')
    expect(markup).toContain('<b>93%</b> smaller')
    expect(CARD_MARKDOWN.startsWith('# Octopus\n…\n| Kingdom: |')).toBe(true)
    expect(AMAZON_FIELDS.find(([k]) => k === 'price')?.slice(1)).toEqual(['64.55', '#buybox .a-price .a-offscreen'])
    expect(DATETIME_TABLE).toMatchObject({ index: 4, columns: 4, rows: 37 })
    expect(DATETIME_TABLE.head[0]).toEqual(['Directive', 'Meaning', 'Example', 'Notes'])
  })

  it('lays the raw HTML and the Markdown on the octopus’s grid as the pane shows them', () => {
    expect(gridRows('<a  href="x">\n\n<b>', 8, false)).toEqual(['<a href=', '"x">', '<b>'])
    expect(gridRows('# Octopus\n\nAn **octopus**', 20, true)).toEqual(['# Octopus', '', 'An **octopus**'])
    // The Markdown wraps between words, as the pane's <pre> does; a word longer than a line breaks anywhere.
    expect(gridRows('aaa bbb ccc', 7, true)).toEqual(['aaa bbb', 'ccc'])
    expect(gridRows('abcdefghij', 4, true)).toEqual(['abcd', 'efgh', 'ij'])
    // As a browser does, it may also wrap after a hyphen inside a word and between a link's ] and (.
    expect(gridRows('eight-limbed [mollusc](https://x)', 14, true)).toEqual(['eight-limbed', '[mollusc]', '(https://x)'])
  })

  it('folds link targets when it shows the Markdown, keeping the first whole and every word', () => {
    const md = 'An **octopus**[[a]](#cite_note-3) is a [mollusc](https://en.wikipedia.org/wiki/Mollusc) of the [order](https://en.wikipedia.org/wiki/Order_(biology)) ![x](https://i.png)'
    expect(foldedText(md)).toBe('An **octopus**[a] is a [mollusc](https://en.wikipedia.org/wiki/Mollusc) of the order x')
    expect(foldMarkdown(md)[0]!.find(s => s.text === 'order')?.url).toBe('https://en.wikipedia.org/wiki/Order_(biology)')
    // Folding drops only link syntax: the shown text is the Markdown with each folded link's brackets and target taken out.
    for (const d of DEMOS) expect(foldedText(d.markdownHead).replace(/\s/g, '').length).toBeLessThanOrEqual(d.markdownHead.replace(/\s/g, '').length)
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
    const dashboard = new Set(DASHBOARD_PAGES.map(([path]) => path))
    const body = markup.slice(markup.indexOf('</header>'), markup.indexOf('<footer'))
    for (const [, href] of body.matchAll(/href="(\/[^"]*)"/g)) {
      const path = href!.split('#')[0]!
      expect([path, docs.has(path) || blog.has(path) || dashboard.has(path) || path === '/' || existsSync(app(`${path.slice(1)}index.html`))]).toEqual([path, true])
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
