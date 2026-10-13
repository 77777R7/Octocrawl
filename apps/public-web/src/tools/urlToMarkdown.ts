import { footerMarkup, heroMarkup } from '../page'
import { fromCodeCards, moreToolsChips, toolBanner, toolCards, toolSection } from './toolSections'
import { glyphCloud } from '../glyphArt'

/** /tools/url-to-markdown/: a free page for one task, converting a public page to Markdown. Its top is a short strip of
 * the coast with the home page's card under it (page.ts, heroMarkup, `tool`), and main.ts runs it as on the home page:
 * the same card, preview, five a day and results. Below, the free tools' sections (toolSections.ts) and the task's
 * questions. vite.config.ts prerenders this markup into tools/url-to-markdown/index.html. */

export const TOOL_PATH = '/tools/url-to-markdown/'
export const TOOL_TITLE = 'Free URL to Markdown Converter | Octocrawl'
export const TOOL_DESCRIPTION = 'Convert any public web page to clean Markdown in your browser, free and without sign-up. When a page can’t be read, you get the reason.'

/** Questions people ask about converting a page to Markdown, answered for this tool. */
export const TOOL_FAQ: ReadonlyArray<readonly [question: string, answer: string]> = [
  ['Is it free? Do I need an account?', 'Yes, and no. You get five conversions a day without signing up, the same allowance as the preview on the home page (with at most 150 a day for the whole site); it resets at 00:00 UTC. With a free account you get 1,000 credits a month for the hosted API and MCP, and Octocrawl on your own computer has no limit.'],
  ['Does it work on pages that need JavaScript?', 'This page reads a page over HTTP and does not run its JavaScript, so a page that draws its content in the browser can come back incomplete, and the result says so. With an account, the hosted API reads such pages in a browser (5 credits a page), and Octocrawl on your own computer can use your own Chrome.'],
  ['Are tables and links kept?', 'Yes. Tables come through as Markdown (GFM) tables, and links keep their addresses. Tables used only to lay out a page aren’t kept as tables, and images stay as Markdown image links; they aren’t downloaded.'],
  ['Does it respect robots.txt?', 'Yes. It reads the site’s robots.txt before fetching the page, and stops if the page is disallowed, or if robots.txt can’t be reached at all (a server error or no answer); the result then says which. A robots.txt that answers 404 counts as no rules. It never signs in, solves a CAPTCHA or gets past a verification page.'],
  ['How big a page can it convert?', 'Pages up to 2 MiB and files such as PDFs up to 5 MiB, and it stops after 40 seconds. A very long page returns its first 1,000,000 characters of Markdown, and the result tells you when that happened.'],
  ['Can I convert many URLs, or call it from code?', 'This page converts one URL at a time. For many pages, call the hosted API (<code>https://api.octocrawl.dev/v1/scrape</code>) or the MCP server from your agent, or run <code>npx octocrawl serve</code> on your own computer, which also crawls a site and reads up to 1,000 URLs in a batch.'],
  ['Do you keep the pages I convert?', 'No. Your results live in this page and are gone when you leave it. Each conversion logs its state and the host of the page, never its path, as the <a href="/docs/privacy/">privacy page</a> says.'],
]

/** The page's structured data: the tool as a free web application. */
export function toolJsonLd(): string {
  const data = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Octocrawl URL to Markdown', url: `__W2L_ORIGIN__${TOOL_PATH}`, description: TOOL_DESCRIPTION, applicationCategory: 'DeveloperApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`
}

export function toolPageMarkup(): string {
  return `
  <div class="page-shell tool-page">
${heroMarkup({
  title: 'Free URL to <em>Markdown</em> converter',
  description: 'Paste a public page and get clean Markdown for an AI&nbsp;agent, a RAG pipeline or your notes. Free, no sign-up. When a page can’t be read, you get the reason.',
  next: '#how',
  nextLabel: 'See how it works',
  art: 'coast',
  tool: { crumb: 'URL to Markdown' },
})}${toolSection('how', 'HOW IT WORKS', 'From a link to clean Markdown.', toolCards([
  ['01', 'Paste a public URL', 'Any page anyone can open without signing in: an article, documentation, a product page, a PDF. Five a day, no account.'],
  ['02', 'Octocrawl checks, then reads', 'It reads the site’s robots.txt first, then fetches the page over HTTP and keeps its main content, leaving out menus, headers and footers.'],
  ['03', 'Take the Markdown', 'Read it rendered or as source, copy it, or download it as a <code>.md</code> file. Page info shows the final URL and what the page says about itself.'],
]))}${toolSection('uses', 'WHO IT IS FOR', 'Markdown is what models read best.', toolCards([
  ['◇', 'AI agents and RAG', 'Give a model the page itself in far fewer tokens than the raw HTML. Headings give natural places to split it into chunks. See <a href="/blog/web-scraping-for-rag/">web scraping for RAG</a>.'],
  ['▤', 'Notes and archives', 'Keep a readable copy of an article or a doc page in Obsidian, Notion or a Git repository.'],
  ['⇢', 'Moving content', 'Bring pages from an old site or a wiki into a static site generator or a new docs tool.'],
]), 'It keeps a page’s headings, paragraphs, lists, tables and links, and drops the markup, scripts and styling around them.')}${toolSection('unread', 'WHEN A PAGE CAN’T BE READ', 'An empty file is not an answer.', toolCards([
  ['✕', 'robots.txt disallows it', 'It stops before fetching and says the site’s rules don’t allow it. If robots.txt can’t be reached at all, it stops too, and says that instead.'],
  ['!', 'The site blocks the request', 'A verification page, a CAPTCHA or a block page is reported as blocked, never converted into Markdown about being blocked.'],
  ['⌂', 'The page needs a login', 'It says so. This page doesn’t sign in; Octocrawl on your own computer can read pages you’re signed in to, in your own Chrome.'],
  ['⟳', 'It is drawn by JavaScript', 'This page doesn’t run scripts, so the result can be incomplete or empty, and it says so. With a free account, the hosted API reads such pages in a browser.'],
], 'is-four'), 'Many converters return a blank or half-blank result and say nothing. Octocrawl says what happened.')}${toolSection('from-code', 'FROM YOUR CODE OR AGENT', 'The same conversion, from your own tools.', fromCodeCards(), 'Every answer carries its <a href="/docs/reference/#evidence-record">Evidence Record</a>: where the page came from, when, and hashes of what was read.')}${toolSection('more-tools', 'MORE FREE TOOLS', 'Other things to take from a page.', moreToolsChips('url-to-markdown'))}
    <section class="faq-section" id="faq" aria-labelledby="faq-title">
      <div class="band">
        <div class="frame faq-grid">
          <div class="faq-intro">
            <pre class="glyph-cloud is-side" data-cols="70" data-rows="34" data-seed="5" aria-hidden="true">${glyphCloud(70, 34, 5)}</pre>
            <p class="section-kicker"><span class="kicker-square"></span> FAQ</p>
            <h2 id="faq-title">Questions,<br />answered <em>plainly.</em></h2>
          </div>
          <div class="faq-list">${TOOL_FAQ.map(([question, answer]) => `<details class="faq-item"><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div>
        </div>
      </div>
    </section>
${toolBanner()}
${footerMarkup('/', false)}  </div>
`
}
