// The site's top navigation, shared by the home page (src/page.ts, through vite.config.ts) and every docs page
// (scripts/build-docs.mjs), so the two headers cannot drift apart. Every address is absolute: the same markup works
// on the home page, where `/#free-tiers` stays on the page, and on a docs page, where it goes home.
// Plain markup: the menus are <details>, so they open with a click, a tap or the keyboard without a script.
// docs-assets/nav.js adds hover, one menu at a time, Escape and the phone menu; docs-assets/nav.css styles them.
import { pages } from './docsPages.mjs'

const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const pathFor = page => page.slug ? `/docs/${page.slug}/` : '/docs/'

/** What Octocrawl does, as on the home page's What it does section, each with where to read more. */
export const NAV_CAPABILITIES = [
  { glyph: '▤', title: 'Scrape a page', text: 'Markdown, tables and fields from one URL', href: '/docs/guides/extract-page/' },
  { glyph: '├', title: 'Map a site', text: 'Every URL in its sitemap and links', href: '/docs/guides/map-site/' },
  { glyph: '»', title: 'Crawl and batch', text: 'Follow links, or read up to 1,000 URLs', href: '/docs/guides/batch-results/' },
  { glyph: '◷', title: 'Watch a page', text: 'What changed, to your HTTPS webhook', href: '/docs/guides/monitor-webhook/' },
  { glyph: '●', title: 'Your own Chrome', text: 'Pages signed in as you, checks you pass', href: '/#what-it-does' },
  { glyph: '#', title: 'Evidence Record', text: 'Where every result came from', href: '/docs/reference/#evidence-record' },
]

/** The ways to use it, as in the Get started section. */
export const NAV_CLIENTS = [
  { glyph: '⌁', title: 'MCP', text: 'Claude Code, Cursor, OpenCode, Codex', href: '/docs/connect-mcp/' },
  { glyph: '›', title: 'CLI', text: 'npx octocrawl, nothing to install', href: '/#get-started' },
  { glyph: '{}', title: 'TypeScript', text: '@octocrawl/sdk', href: '/docs/reference/#rest-and-sdk' },
  { glyph: 'py', title: 'Python', text: 'octocrawl-client, into pandas', href: '/docs/reference/#rest-and-sdk' },
  { glyph: '↔', title: 'REST API', text: 'api.octocrawl.dev or your own', href: '/docs/reference/#rest-and-sdk' },
]

/** The docs menu: the guide groups as the sidebar has them; the project pages (privacy, terms) stay in the footer. */
export const NAV_DOC_GROUPS = ['Get started', 'Guides', 'Reference']

// The spaces between the parts keep a link's text readable as words ("Scrape a page Markdown, …") for crawlers, readers
// and copy-paste; the grid lays the parts out and ignores them.
const item = ({ glyph, title, text, href }) => `<li><a href="${href}"><span class="nav-glyph" aria-hidden="true">${esc(glyph)}</span> <span class="nav-title">${esc(title)}</span> <span class="nav-text">${esc(text)}</span></a></li>`

/** The header's navigation and its two actions (GitHub, Try it), the same on every page. `current` marks a top-level
 * item as the page being read: 'docs' or 'changelog'. */
export function siteNavMarkup(current = '') {
  const docs = NAV_DOC_GROUPS.map(group => `<div class="nav-col"><p class="nav-kicker">${esc(group)}</p><ul>${pages.filter(page => page.group === group).map(page => `<li><a href="${pathFor(page)}"><span class="nav-title">${esc(page.title)}</span></a></li>`).join('')}${group === 'Reference' ? '<li><a href="/llms.txt"><span class="nav-title">llms.txt</span></a></li>' : ''}</ul></div>`).join('')
  return `<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" hidden><span class="nav-toggle-mark" aria-hidden="true">≡</span>Menu</button>
          <nav class="site-nav" id="site-nav" aria-label="Main navigation">
            <ul class="nav-list">
              <li class="nav-item"><details class="nav-drop"><summary>Product<span class="nav-caret" aria-hidden="true">▾</span></summary><div class="nav-panel nav-product">
                <div class="nav-col"><p class="nav-kicker">What it does</p><ul>${NAV_CAPABILITIES.map(item).join('')}</ul></div>
                <div class="nav-col"><p class="nav-kicker">Use it from</p><ul>${NAV_CLIENTS.map(item).join('')}</ul></div>
                <a class="nav-feature" href="/docs/connect-mcp/"><span class="nav-feature-tag">MCP</span> <span class="nav-feature-title">Connect your agent in one line</span> <code>claude mcp add \\\n  --transport http octocrawl \\\n  https://mcp.octocrawl.dev/mcp</code> <span class="nav-feature-note">No account, 20 pages a day. Setup for every client <span aria-hidden="true">→</span></span></a>
              </div></details></li>
              <li class="nav-item"><details class="nav-drop"><summary${current === 'docs' ? ' aria-current="page"' : ''}>Docs<span class="nav-caret" aria-hidden="true">▾</span></summary><div class="nav-panel nav-docs">${docs}</div></details></li>
              <li class="nav-item"><a class="nav-link" href="/#free-tiers">Free tiers</a></li>
              <li class="nav-item"><a class="nav-link" href="/changelog/"${current === 'changelog' ? ' aria-current="page"' : ''}>Changelog</a></li>
            </ul>
          </nav>`
}

/** The header's two actions: the repository, and the page that tries Octocrawl. */
export function siteActionsMarkup() {
  return `<div class="header-actions"><a class="github-link" href="https://github.com/77777R7/Octocrawl" aria-label="Octocrawl on GitHub"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg><span class="github-label">GitHub</span><span class="card-arrow" aria-hidden="true">↗</span></a><a class="try-link" href="/#top">Try it <span aria-hidden="true">→</span></a></div>`
}
