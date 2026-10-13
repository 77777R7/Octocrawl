import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blogPath, posts } from '../scripts/blogPosts.mjs'
import { pages } from '../scripts/docsPages.mjs'
import { NAV_CAPABILITIES } from '../scripts/siteNav.mjs'
import { scrapeBody, scrapeSnippet } from '../src/product/scrapeCode'
import { SCRAPE_FAQ, SCRAPE_PATH, SCRAPE_TITLE, STEPS, scrapeJsonLd, scrapePageMarkup } from '../src/product/scrapePage'
import { FIELDS, LINKS, MARKDOWN, RUN, TABLE } from '../src/product/scrapeRun'
import type { Choice } from '../src/product/scrapeState'

// /scrape/: one recorded scrape (src/product/scrapeRun.ts) played in the hero, walked through in How it works, and the
// cards, code, calculator and FAQ below.
const app = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
const markup = scrapePageMarkup()
const ids = (html: string) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id!))
const choice = (change: Partial<Choice> = {}): Choice => ({ view: 'markdown', whole: false, fields: ['title', 'price'], fieldsTouched: false, ...change })

describe('the /scrape/ product page', () => {
  it('is built, linked from the Product menu and listed in the sitemap', () => {
    const entry = readFileSync(app('scrape/index.html'), 'utf8')
    expect(entry).toContain('<script type="module" src="/src/product/scrapeMain.ts"></script>')
    expect(entry).toContain(`<title>${SCRAPE_TITLE}</title>`)
    expect(readFileSync(app('vite.config.ts'), 'utf8')).toContain('./scrape/index.html')
    expect(readFileSync(app('scripts/build-docs.mjs'), 'utf8')).toContain(`const SCRAPE_PATH = '${SCRAPE_PATH}'`)
    expect(NAV_CAPABILITIES.find(item => item.title === 'Scrape a page')?.href).toBe(SCRAPE_PATH)
  })

  it('shows the recorded page as recorded: its bytes hash to the Evidence Record, and every line names its source', () => {
    // The Evidence Record card hashes this copy in the reader's browser; it must be the bytes that were read.
    const sample = readFileSync(app('public/samples/books-toscrape-a-light-in-the-attic.html.txt'))
    expect(sample.length).toBe(RUN.bytes)
    expect(createHash('sha256').update(sample).digest('hex')).toBe(RUN.rawSha256)
    expect(sample.toString('utf8')).toContain('<p class="price_color">£51.77</p>')
    const sources = ids(markup.replace(/data-src="([^"]+)"/g, ' id="src:$1"'))
    for (const src of [...MARKDOWN.flatMap(m => (m.src ? [m.src] : [])), ...LINKS.map(l => l.src), ...FIELDS.map(f => f.src)]) {
      expect([src, sources.has(`src:${src}`)]).toEqual([src, true])
    }
    expect(TABLE).toHaveLength(7)
    expect(markup.match(/class="pl-step"/g)).toHaveLength(STEPS.length)
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

  it('writes the call for what the reader chose', () => {
    expect(scrapeBody(RUN.url, choice())).toEqual({ url: RUN.url, formats: ['markdown'] })
    expect(scrapeBody(RUN.url, choice({ view: 'table', whole: true }))).toEqual({ url: RUN.url, formats: ['tables'], onlyMainContent: false })
    const fields = scrapeBody(RUN.url, choice({ view: 'fields', fields: ['title', 'author'] }))
    expect(fields.formats).toEqual([{ type: 'json', schema: { type: 'object', properties: { title: { type: ['string', 'null'] }, author: { type: ['string', 'null'] } }, required: ['title', 'author'], additionalProperties: false } }])
    // Fields picked in their card join the hero's format.
    expect((scrapeBody(RUN.url, choice({ view: 'links', fieldsTouched: true })).formats as unknown[])[0]).toBe('links')
    expect(scrapeSnippet('curl', RUN.url, choice())).toContain(`-d '{"url":"${RUN.url}","formats":["markdown"]}'`)
    expect(scrapeSnippet('cli', RUN.url, choice())).toBe(`npx octocrawl scrape '${RUN.url}' --markdown`)
    expect(scrapeSnippet('cli', RUN.url, choice({ view: 'links', whole: true }))).toBe(`npx octocrawl scrape '${RUN.url}' --formats links --no-only-main-content`)
    const python = scrapeSnippet('py', RUN.url, choice({ view: 'fields', whole: true }))
    expect(python).toContain('"additionalProperties": False')
    expect(python).toContain('only_main_content=False,')
    expect(scrapeSnippet('ts', RUN.url, choice())).toContain("new W2L({ baseUrl: 'http://127.0.0.1:8787' })")
    expect(scrapeSnippet('mcp', RUN.url, choice({ whole: true }))).toContain('(the whole page, not only the main content)')
  })

  it('hands a reader’s URL to the free tool page, which runs it only when this tab asked', () => {
    const main = readFileSync(app('src/main.ts'), 'utf8')
    expect(main).toContain("new URLSearchParams(window.location.search).get('url')")
    expect(main).toContain("sessionStorage.getItem('w2l:handoff') === handed")
    expect(readFileSync(app('src/product/scrapeFeatures.ts'), 'utf8')).toContain("sessionStorage.setItem('w2l:handoff', url)")
  })
})
