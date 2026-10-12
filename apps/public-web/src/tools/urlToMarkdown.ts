import { footerMarkup, heroMarkup, renderSectionBar } from '../page'
import { glyphCloud } from '../glyphArt'

/** /tools/url-to-markdown/: a free page for one task, converting a public page to Markdown. Its top is the home page's
 * hero with its own words (page.ts, heroMarkup), and main.ts runs it as on the home page: the same card, preview,
 * five a day and results. Below, the task's questions, in the home page's section styles. vite.config.ts prerenders
 * this markup into tools/url-to-markdown/index.html. */

export const TOOL_PATH = '/tools/url-to-markdown/'
export const TOOL_TITLE = 'Free URL to Markdown Converter | Octocrawl'
export const TOOL_DESCRIPTION = 'Convert any public web page to clean Markdown in your browser, free and without sign-up. When a page can’t be read, you get the reason.'

const SECTIONS = [
  ['how', 'HOW IT WORKS'],
  ['uses', 'WHAT IT IS FOR'],
  ['unread', 'WHEN A PAGE CAN’T BE READ'],
  ['from-code', 'FROM YOUR CODE OR AGENT'],
  ['faq', 'FAQ'],
] as const
const bar = (id: (typeof SECTIONS)[number][0]) => { const index = SECTIONS.findIndex(([key]) => key === id); return renderSectionBar(index, SECTIONS.length, SECTIONS[index]![1]) }

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

/** One of the page's sections in the home page's How it works layout: the words on the left, numbered rows beside them. */
function section(id: (typeof SECTIONS)[number][0], kicker: string, title: string, lead: string, rows: ReadonlyArray<readonly [string, string]>): string {
  return `
    <section class="how-section tool-section" id="${id}" aria-labelledby="${id}-title">
      ${bar(id)}
      <div class="band">
        <div class="frame how-grid">
          <div class="how-intro">
            <p class="section-kicker"><span class="kicker-square"></span> ${kicker}</p>
            <h2 id="${id}-title">${title}</h2>
            <p class="section-lead">${lead}</p>
          </div>
          <ol class="how-list" role="list">${rows.map(([head, text], i) => `<li class="how-step"><span class="step-number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><div><h3>${head}</h3><p>${text}</p></div></li>`).join('')}</ol>
        </div>
      </div>
    </section>`
}

export function toolPageMarkup(): string {
  return `
  <div class="page-shell">
${heroMarkup({
  title: 'URL to <em>Markdown.</em>',
  description: 'Paste a public page and get clean Markdown for an AI&nbsp;agent, a RAG pipeline or your notes. Free, no sign-up. When a page can’t be read, you get the reason.',
  next: '#how',
  nextLabel: 'See how it works',
  art: 'coast',
})}${section('how', 'HOW IT WORKS', 'From a link<br />to clean Markdown.', 'No install and no account: paste the address and take the text.', [
  ['Paste a public URL', 'Any page anyone can open without signing in: an article, documentation, a product page, a PDF. You get five conversions a day.'],
  ['Octocrawl checks, then reads', 'It reads the site’s robots.txt first, then fetches the page over HTTP and keeps its main content, leaving out menus, headers and footers. Choose <em>Whole page</em> in Options to keep them.'],
  ['Take the Markdown', 'Read it rendered or as source, copy it, or download it as a <code>.md</code> file. Page info shows the final URL and what the page says about itself.'],
])}${section('uses', 'WHAT IT IS FOR', 'Markdown is what<br />models read best.', 'It keeps a page’s headings, paragraphs, lists, tables and links, and drops the markup, scripts and styling around them.', [
  ['AI agents and chat', 'Give a model the page itself, not a summary of a summary, in far fewer tokens than the raw HTML.'],
  ['RAG pipelines', 'Headings give natural places to split a page into chunks. See <a href="/blog/web-scraping-for-rag/">web scraping for RAG</a>.'],
  ['Notes and archives', 'Keep a readable copy of an article or a doc page in Obsidian, Notion or a Git repository.'],
  ['Moving content', 'Bring pages from an old site or a wiki into a static site generator or a new docs tool.'],
])}${section('unread', 'WHEN A PAGE CAN’T BE READ', 'An empty file<br />is not an answer.', 'Many converters return a blank or half-blank result and say nothing. Octocrawl says what happened.', [
  ['robots.txt disallows the page', 'It stops before fetching and says the site’s rules don’t allow it. If robots.txt can’t be reached at all, it stops too, and says that instead.'],
  ['The site blocks the request', 'A verification page, a CAPTCHA or a block page is reported as blocked, never converted into Markdown about being blocked.'],
  ['The page needs a login', 'It says so. This page doesn’t sign in; Octocrawl on your own computer can read pages you’re signed in to, in your own Chrome.'],
  ['The content is drawn by JavaScript', 'This page doesn’t run scripts, so the result can be incomplete, and it is marked so. The hosted API can read such pages in a browser.'],
])}${section('from-code', 'FROM YOUR CODE OR AGENT', 'The same conversion,<br />from your own tools.', 'Hosted Octocrawl answers without a key for 20 pages a day; a free account gives 1,000 credits a month and API keys. Each answer carries its <a href="/docs/reference/#evidence-record">Evidence Record</a>.', [
  ['REST', '<code>curl https://api.octocrawl.dev/v1/scrape -H \'content-type: application/json\' -d \'{"url":"https://example.com","formats":["markdown"]}\'</code>'],
  ['Claude Code, Cursor, Codex, OpenCode', '<code>claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp</code>. <a href="/docs/connect-mcp/">Connect MCP</a> has the line for each client.'],
  ['On your own computer', '<code>npx octocrawl serve</code> runs the same API with no limit, and crawls and batches too.'],
])}
    <section class="faq-section" id="faq" aria-labelledby="faq-title">
      ${bar('faq')}
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

${footerMarkup('/')}  </div>
`
}
