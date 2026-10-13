import { toolPageJsonLd, toolPageMarkup as renderToolPage, type ToolPage } from './toolPage'
import { UNREAD } from './toolSections'

/** /tools/url-to-markdown/: a free page for one task, converting a public page to Markdown, in the free tools' page
 * (toolPage.ts). vite.config.ts prerenders this markup into tools/url-to-markdown/index.html. */

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

export const URL_TO_MARKDOWN: ToolPage = {
  slug: 'url-to-markdown',
  name: 'URL to Markdown',
  docTitle: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  hero: {
    title: 'Free URL to <em>Markdown</em> converter',
    description: 'Paste a public page and get clean Markdown for an AI&nbsp;agent, a RAG pipeline or your notes. Free, no sign-up. When a page can’t be read, you get the reason.',
    tool: { crumb: 'URL to Markdown' },
  },
  steps: { title: 'From a link to clean Markdown.', cards: [
    ['01', 'Paste a public URL', 'Any page anyone can open without signing in: an article, documentation, a product page, a PDF. Five a day, no account.'],
    ['02', 'Octocrawl checks, then reads', 'It reads the site’s robots.txt first, then fetches the page over HTTP and keeps its main content, leaving out menus, headers and footers.'],
    ['03', 'Take the Markdown', 'Read it rendered or as source, copy it, or download it as a <code>.md</code> file. Page info shows the final URL and what the page says about itself.'],
  ] },
  uses: { title: 'Markdown is what models read best.', lead: 'It keeps a page’s headings, paragraphs, lists, tables and links, and drops the markup, scripts and styling around them.', cards: [
    ['◇', 'AI agents and RAG', 'Give a model the page itself in far fewer tokens than the raw HTML. Headings give natural places to split it into chunks. See <a href="/blog/web-scraping-for-rag/">web scraping for RAG</a>.'],
    ['▤', 'Notes and archives', 'Keep a readable copy of an article or a doc page in Obsidian, Notion or a Git repository.'],
    ['⇢', 'Moving content', 'Bring pages from an old site or a wiki into a static site generator or a new docs tool.'],
  ] },
  unread: { title: 'An empty file is not an answer.', lead: 'Many converters return a blank or half-blank result and say nothing. Octocrawl says what happened.', cards: UNREAD },
  code: { title: 'The same conversion, from your own tools.', format: 'markdown' },
  faq: TOOL_FAQ,
}

/** The page's structured data: the tool as a free web application. */
export const toolJsonLd = (): string => toolPageJsonLd(URL_TO_MARKDOWN)
export const toolPageMarkup = (): string => renderToolPage(URL_TO_MARKDOWN)
