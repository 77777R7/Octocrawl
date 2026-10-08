import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractTf, htmlToMarkdown, wholePageBody } from '../src/index.js'

const WIKIPEDIA_URL = 'https://en.wikipedia.org/wiki/Web_scraping'
/** A saved copy of the article in the Vector 2022 skin; the comment at its top says what was trimmed. */
const WIKIPEDIA = readFileSync(new URL('./fixtures/wikipedia-web-scraping.html', import.meta.url), 'utf8')

// Navigation a site lays out inside its content column, where the main-content
// selection cannot see it apart from the article: Wikipedia's Vector 2022 skin
// puts the language menu and the page tools in <main>, beside the H1.
describe('navigation inside the content column', () => {
  it("drops Wikipedia's language menu, page tools and portal box from the main content and keeps the article", () => {
    const out = extractTf.extract(WIKIPEDIA, { url: WIKIPEDIA_URL })
    const markdown = htmlToMarkdown(out.mainHtml, { baseUrl: WIKIPEDIA_URL })
    expect(out.pageType).toBe('article')
    // The Markdown opens with the article, not with the interlanguage list the titlebar holds beside the H1.
    expect(markdown).toMatch(/^# Web scraping\n\nFrom Wikipedia, the free encyclopedia\n\nMethod of extracting data from websites\n\n/)
    expect(markdown).not.toContain('22 languages')
    expect(markdown).not.toContain('ar.wikipedia.org')
    expect(markdown).not.toContain('Edit links')
    // The page tabs and tools, which the toolbar's portlets hold.
    for (const item of ['View history', 'What links here', 'Download as PDF', 'Printable version']) expect(markdown, item).not.toContain(item)
    // The "See also" portal box is a navigation list too.
    expect(markdown).not.toContain('Internet portal')
    // The article body stays: lead, sections, links and references.
    expect(markdown).toContain('web harvesting')
    expect(markdown).toContain('\n## History\n')
    expect(markdown).toContain('[Data scraping](https://en.wikipedia.org/wiki/Data_scraping)')
    expect(markdown).toContain('\n## References\n')
  })

  it('drops [role=navigation], MediaWiki portlets and Vector menus, which a named selection and the whole page keep', () => {
    const html = `<!doctype html><html><body>
<main>
<header><h1>Harbour tides</h1><div id="p-lang-btn" class="vector-dropdown mw-portlet mw-portlet-lang"><label>3 languages</label><ul><li><a href="https://de.example/Gezeiten">Deutsch</a></li><li><a href="https://fr.example/Marees">Français</a></li><li><a href="https://nl.example/Getij">Nederlands</a></li></ul></div></header>
<div role="navigation" aria-label="Page tools"><a href="/a">Article</a> <a href="/t">Talk</a> <a href="/h">View history</a></div>
<div class="vector-menu"><ul><li><a href="/cite">Cite this page</a></li></ul></div>
<p>The harbour master recorded the tides every hour without exception through the winter months, and the ledger survives in the archive.</p>
<p>Spring tides rose a full metre above the quay on three nights in February, each entry initialled by the night watch and the master.</p>
</main></body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('recorded the tides every hour')
    expect(out.mainHtml).toContain('<h1>Harbour tides</h1>')
    for (const item of ['3 languages', 'Deutsch', 'View history', 'Cite this page']) expect(out.mainHtml, item).not.toContain(item)
    // A navigation the caller names is kept, as is the whole page's.
    expect(extractTf.extract(html, { includeSelectors: ['.mw-portlet'] }).mainHtml).toContain('Deutsch')
    expect(wholePageBody(html)).toContain('View history')
  })
})
