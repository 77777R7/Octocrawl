/** The free tools' shared parts: the list of tools (live and coming next), and the sections the hub (/tools/) and each
 * tool page share below their top: the steps, the same call from code, more tools, the closing banner. */

export const TOOLS_PATH = '/tools/'

export type Tool = { slug: string; name: string; glyph: string; text: string; live: boolean }
/** Live tools link to their page; the others are listed as coming next and link nowhere. */
// Chosen from search demand on 2026-10-13: Search Console, Bing keyword research and the live results' intent.
export const TOOLS: readonly Tool[] = [
  { slug: 'url-to-markdown', name: 'URL to Markdown', glyph: '↓', text: 'Paste a public page and get clean Markdown for an AI agent, a RAG pipeline or your notes.', live: true },
  { slug: 'website-to-text', name: 'Website to Text', glyph: '¶', text: 'A page’s readable text without the markup, to copy or download as a .txt file.', live: true },
  // The whole-site Link Extractor (map: the site's sitemaps and the start page's links); its path is linked from the
  // blog's find-all-pages article, so it stays.
  { slug: 'link-extractor', name: 'Link Extractor', glyph: '⇢', text: 'Every page of a site, and where each was found: its sitemap or its links. Or just one page’s links.', live: false },
]
export const toolPath = (tool: Tool): string => `${TOOLS_PATH}${tool.slug}/`

/** One section in the tool pages' light style: a kicker, a heading and what goes under them. */
export function toolSection(id: string, kicker: string, title: string, body: string, lead = ''): string {
  return `
    <section class="tl-section" id="${id}" aria-labelledby="${id}-title">
      <div class="band">
        <div class="frame tl-frame">
          <p class="section-kicker"><span class="kicker-square"></span> ${kicker}</p>
          <h2 id="${id}-title">${title}</h2>${lead ? `
          <p class="section-lead">${lead}</p>` : ''}
          ${body}
        </div>
      </div>
    </section>`
}

/** Cards in a row: a number or glyph, a heading and a line. */
export function toolCards(cards: ReadonlyArray<readonly [mark: string, head: string, text: string]>, className = ''): string {
  return `<ol class="tl-cards${className ? ` ${className}` : ''}" role="list">${cards.map(([mark, head, text]) => `<li class="tl-card"><span class="tl-mark" aria-hidden="true">${mark}</span><h3>${head}</h3><p>${text}</p></li>`).join('')}</ol>`
}

/** What each tool page says happens when a page can't be read. */
export const UNREAD: ReadonlyArray<readonly [string, string, string]> = [
  ['✕', 'robots.txt disallows it', 'It stops before fetching and says the site’s rules don’t allow it. If robots.txt can’t be reached at all, it stops too, and says that instead.'],
  ['!', 'The site blocks the request', 'A verification page, a CAPTCHA or a block page is reported as blocked, never turned into a result about being blocked.'],
  ['⌂', 'The page needs a login', 'It says so. These tools don’t sign in; Octocrawl on your own computer can read pages you’re signed in to, in your own Chrome.'],
  ['⟳', 'It is drawn by JavaScript', 'These tools don’t run scripts, so the result can be incomplete or empty, and it says so. With a free account, the hosted API reads such pages in a browser.'],
]

/** What a tool's page asks the API for in its code: Markdown (Website to Text strips it), or links. */
export type CodeFormat = 'markdown' | 'links'

/** The same thing from code: four ways in, each with a real line to copy. */
export function fromCodeCards(format: CodeFormat = 'markdown'): string {
  const cards: Array<[string, string, string, string, string]> = [
    ['REST API', 'Hosted, no key for 20 pages a day; a free account’s key for 1,000 credits a month.', `curl https://api.octocrawl.dev/v1/scrape -H 'content-type: application/json' -d '{"url":"https://example.com","formats":["${format}"]}'`, '/docs/reference/#rest-and-sdk', 'API reference'],
    ['MCP', 'Claude Code, Cursor, Codex and OpenCode read pages through Octocrawl’s tools.', 'claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp', '/docs/connect-mcp/', 'Connect MCP'],
    ['CLI', 'On your own computer, with no daily limit, plus crawl and batch.', format === 'links' ? 'npx octocrawl scrape https://example.com --formats links' : 'npx octocrawl scrape https://example.com --markdown', '/docs/reference/', 'Advanced reference'],
    ['Playground', 'Signed in, run any page on your credits, read in a browser when it needs one.', 'octocrawl.dev/dashboard/scrape/', '/dashboard/scrape/', 'Open the Playground'],
  ]
  return `<ul class="tl-code-cards" role="list">${cards.map(([head, text, code, href, link]) => `<li class="tl-code-card"><h3>${head}</h3><p>${text}</p><code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code><a href="${href}">${link} <span aria-hidden="true">→</span></a></li>`).join('')}</ul>`
}

/** More free tools, as chips: the live ones but this one, then the product page and the hub. */
export function moreToolsChips(current = ''): string {
  const live = TOOLS.filter((tool) => tool.live && tool.slug !== current).map((tool) => `<a class="tl-chip" href="${toolPath(tool)}">${tool.name}</a>`)
  return `<div class="tl-chips">${[...live, '<a class="tl-chip" href="/scrape/">Scrape API</a>', `<a class="tl-chip" href="${TOOLS_PATH}">All free tools</a>`].join('')}</div>`
}

/** The closing banner: an account's monthly credits, or Octocrawl on your own computer. */
export function toolBanner(): string {
  return `
    <section class="tl-banner-section" aria-labelledby="tl-banner-title">
      <div class="band">
        <div class="frame tl-banner">
          <h2 id="tl-banner-title">More than five a day? <em>Start free.</em></h2>
          <p>A free account gets 1,000 credits a month for the hosted API, MCP and the Playground. No card. Or run Octocrawl on your own computer, with no limit.</p>
          <div class="tl-banner-actions"><a class="tl-button is-primary" href="/signin/">Start free <span aria-hidden="true">→</span></a><a class="tl-button" href="https://github.com/77777R7/Octocrawl">Run it yourself <span aria-hidden="true">↗</span></a></div>
        </div>
      </div>
    </section>`
}
