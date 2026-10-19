import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blogPath, posts } from '../scripts/blogPosts.mjs'
import { pages } from '../scripts/docsPages.mjs'
import { DASHBOARD_PAGES } from '../scripts/dashboardPages.mjs'
import { NAV_CAPABILITIES } from '../scripts/siteNav.mjs'
import { climbAt } from '../src/product/ladderScene'
import { scrapeSnippet } from '../src/product/scrapeCode'
import { gridRows } from '../src/product/scrapeDrop'
import { foldMarkdown, foldedText } from '../src/product/scrapeMarkdown'
import { BUILT_FOR, EVIDENCE_STEPS, FORMAT_CARDS, LADDER, SCRAPE_DESCRIPTION, SCRAPE_FAQ, SCRAPE_PATH, SCRAPE_TITLE, scrapeJsonLd, scrapePageMarkup } from '../src/product/scrapePage'
import { AMAZON_FIELDS, DEMOS, DOCS, DOCS_CELL, DOCS_SAMPLE, OCTOPUS_SIZES, PDF_READ, WIKIPEDIA_REQUEST } from '../src/product/scrapeRun'

// /scrape/: three scrapes recorded on hosted Octocrawl (src/product/scrapeRun.ts) in the hero, then how it climbs to read a page, the
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
    // The format cards' artwork, versioned like the other artwork.
    for (const art of ['sky-1', 'sky-2', 'sky-3', 'nature-1', 'nature-2', 'nature-3']) expect([art, existsSync(app(`public/assets/cards/${art}.webp`))]).toEqual([art, true])
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
  })

  it('opens What you get with the banner, then one item and one card per format, in the same order', () => {
    expect(markup.indexOf('id="what-you-get"')).toBeGreaterThan(markup.indexOf('id="demo"'))
    expect(markup.indexOf('id="what-you-get"')).toBeLessThan(markup.indexOf('id="built-for"'))
    expect(markup).toContain('<div class="fx-light" aria-hidden="true"></div>')
    expect(markup.match(/class="fx-item[ "]/g)).toHaveLength(FORMAT_CARDS.length)
    expect(markup.match(/<div class="fx-card /g)).toHaveLength(FORMAT_CARDS.length)
    FORMAT_CARDS.forEach((c, i) => {
      expect(markup).toContain(`aria-controls="fx-card-${c.id}">${c.title}</button>`)
      expect(markup).toContain(`id="fx-card-${c.id}" data-step="${i}"`)
    })
    // Narrow screens put each card after its words by these orders (product.css), one pair per format.
    const css = readFileSync(app('src/product/product.css'), 'utf8')
    FORMAT_CARDS.forEach((_, i) => expect(css).toContain(`.fx-item[data-step="${i}"] { order: ${2 * i}; } .fx-card[data-step="${i}"] { order: ${2 * i + 1}; }`))
  })

  it('paints the format cards with the three skies, then the three landscapes, and nothing over them', () => {
    const css = readFileSync(app('src/product/product.css'), 'utf8')
    const art = FORMAT_CARDS.map((c) => new RegExp(`\\.fx-card\\.is-${c.id} \\{ background-image: url\\('/assets/cards/([a-z]+-\\d)\\.webp'\\)`).exec(css)?.[1])
    expect(art).toEqual(['sky-1', 'sky-2', 'sky-3', 'nature-1', 'nature-2', 'nature-3'])
    for (const c of FORMAT_CARDS) expect(markup).toContain(`<div class="fx-card is-${c.id}${c === FORMAT_CARDS[0] ? ' is-active' : ''}" id="fx-card-${c.id}" data-step="${FORMAT_CARDS.indexOf(c)}">`)
  })

  it('follows What you get with Built for: three cards, each with its figure', () => {
    expect(markup.indexOf('id="built-for"')).toBeGreaterThan(markup.indexOf('id="what-you-get"'))
    expect(markup.indexOf('id="built-for"')).toBeLessThan(markup.indexOf('id="ladder"'))
    expect(markup).toContain('Built for agents that <b>read</b>, pipelines that <b>learn</b>, and jobs that <b>watch</b>.')
    expect(markup.match(/<li class="bf-card">/g)).toHaveLength(BUILT_FOR.length)
    for (const card of BUILT_FOR) expect(markup).toContain(`data-icon="${card.icon}"`)
    // The cards say who it is for; there is nothing in them to click.
    expect(markup.slice(markup.indexOf('id="built-for"'), markup.indexOf('id="ladder"'))).not.toContain('<a ')
  })

  it('follows Built for with how it reads a page: the four steps, then the Evidence Record, and no harder-pages section', () => {
    expect(markup.indexOf('id="ladder"')).toBeGreaterThan(markup.indexOf('id="built-for"'))
    expect(markup.indexOf('id="ladder"')).toBeLessThan(markup.indexOf('id="evidence-record"'))
    expect(markup).not.toContain('id="harder"')
    expect(markup).toContain('Starts light. <b>Climbs</b> when a page fights back.')
    expect(LADDER.map((s) => s.title)).toEqual(['HTTP', 'A browser', 'Your installed Chrome', 'Your own Chrome'])
    // One item per step; the last two say they run on your computer.
    expect(markup.match(/<li class="ld-step[ "]/g)).toHaveLength(LADDER.length)
    expect(LADDER.slice(2).every((s) => s.meta[0] === 'On your computer')).toBe(true)
    // Each step says what it is in more than a line, and what it needs.
    for (const step of LADDER) expect(step.text.length).toBeGreaterThan(120)
    // What each needs is said: installed Chrome needs an access grant, and your own Chrome is chosen, not climbed to.
    expect(LADDER[2]!.meta).toContain('access: "enhanced" with an access grant')
    expect(LADDER[3]!.meta.join(' ')).toMatch(/You choose it/)
    expect(LADDER.map((s) => s.text).join(' ')).not.toMatch(/under a second/)
    expect(markup).toContain('<canvas class="ld-canvas" aria-hidden="true"></canvas>')
    // The climb runs from the drop to the summit as the track scrolls by, in order and never backwards.
    const stops = Array.from({ length: 101 }, (_, i) => climbAt(i / 100))
    expect(stops[0]).toMatchObject({ phase: 'drop', ledge: 0 })
    expect(stops[100]).toMatchObject({ phase: 'stay', ledge: LADDER.length })
    for (let i = 1; i < stops.length; i++) expect(stops[i]!.ledge).toBeGreaterThanOrEqual(stops[i - 1]!.ledge)
  })

  it('puts one window of recorded output on each format card', () => {
    expect(markup.match(/class="fx-win[ "]/g)).toHaveLength(FORMAT_CARDS.length)
    for (const tag of ['922 KB → 62 KB', '4 × 37 · also CSV', 'HTTP → browser', 'PDF · 15 of 15 pages']) expect(markup).toContain(`<b class="fx-win-tag">${tag}</b>`)
    // The PDF read (research/hosted/2026-10-18-scrape-page-pdf-714af563.md): all 15 pages read, its Markdown in order.
    expect(PDF_READ).toMatchObject({ pageCount: 15, pagesRead: 15 })
    expect(PDF_READ.lines.filter((line) => line.startsWith('<!-- page'))).toEqual(['<!-- page 1 -->', '<!-- page 2 -->'])
    // 922,203 bytes of HTML read; 158,375 of Markdown for the whole page (the 16:00 read).
    expect(OCTOPUS_SIZES).toMatchObject({ rawBytes: 922_203, markdownBytes: 158_375 })
    expect(markup).toContain('<b class="fx-win-tag">922 KB → 158 KB</b>')
    // The lead paragraph the window quotes is the line after the title in the hero's read, the same in both reads.
    expect(DEMOS[0]!.markdownHead.split('\n')[2]!.startsWith('An **octopus**')).toBe(true)
    expect(AMAZON_FIELDS.find(([k]) => k === 'price')?.slice(1)).toEqual(['64.55', '#buybox .a-price .a-offscreen'])
    expect(markup).toContain('<span class="w">← field_unavailable</span>')
    // Assistive tech reads each result from a copy that the decode never touches; the animated text is hidden from it.
    expect(markup.match(/<pre class="fx-win-body" aria-hidden="true">/g)).toHaveLength(FORMAT_CARDS.length)
    expect(markup.match(/<pre class="visually-hidden">/g)).toHaveLength(FORMAT_CARDS.length)
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
    // The check claims nothing before it has hashed: its fingerprint is blank, its verdict pending, nothing announced.
    expect(markup).toContain('<p class="visually-hidden" id="ev-live" aria-live="polite"></p>')
    expect(markup).toContain(`<span class="ev-hash is-here" id="ev-hash-here" aria-hidden="true">`)
    expect(markup).toContain('<p class="ft-verdict is-pending" id="ft-verdict">')
    expect(markup).not.toContain('ft-verdict is-match')
  })

  it('stages the Evidence Record: five steps beside the record of a read, with a refusal behind it and no links', () => {
    const section = markup.slice(markup.indexOf('id="evidence-record"'), markup.indexOf('id="call-it"'))
    expect(section).toContain('<p class="ev-eyebrow">The Evidence Record</p>')
    expect(section).toContain('Every page comes with its <b>receipt</b>.')
    expect(section).not.toContain('<a ')
    expect(section.match(/<li class="ev-step[ "]/g)).toHaveLength(EVIDENCE_STEPS.length)
    expect(EVIDENCE_STEPS.map(([title]) => title)).toEqual(['Where it came from', 'When, and was it allowed', 'A fingerprint of every byte', 'Even a refusal', 'Check it yourself'])
    // The read's values are that read's own: its time (rolled in digit by digit, read out whole), its bytes, and its
    // fingerprint laid out digit by digit in order.
    expect(section).toContain('<span class="visually-hidden">2026-10-17 18:17:37 UTC</span>')
    expect(section).toContain(`<span class="ev-count">${DOCS.bytes.toLocaleString('en-US')}</span> bytes read`)
    const record = section.slice(section.indexOf('<span class="ev-hash is-record"'), section.indexOf('<span class="visually-hidden">', section.indexOf('<span class="ev-hash is-record"')))
    expect([...record.matchAll(/<i data-i="(\d+)">([0-9a-f])<\/i>/g)].map(([, i, ch]) => `${i}${ch}`).join(' ')).toBe([...DOCS.rawSha256].map((ch, i) => `${i}${ch}`).join(' '))
    // Each digit column of the time starts at its own digit, so it reads right without the script.
    for (const [, column] of section.matchAll(/<span class="ev-digit-col">(\d{20})<\/span>/g)) expect(column![0]).toBe(column![10])
    // The refusal sent no request and cost nothing.
    expect(section).toContain('failed · policy_denied')
    expect(section).toContain('<span>0 credits</span>')
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
