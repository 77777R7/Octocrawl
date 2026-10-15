import type { ToolPage } from './toolPage'
import { conversionExample } from './conversionExample'
import { UNREAD } from './toolSections'

/** /tools/website-to-text/: a page's readable text without the markup (the preview's Markdown, made plain in the
 * browser by markdownText.ts; main.ts shows it as the Text view). */
export const WEBSITE_TO_TEXT: ToolPage = {
  slug: 'website-to-text',
  name: 'Website to Text',
  docTitle: 'Free Website to Text Converter | Octocrawl',
  description: 'Extract the readable text of any public web page, free and without sign-up: the article, not the menus, without the markup, to copy or download as a .txt file.',
  hero: {
    title: 'Free <em>Website to Text</em> converter',
    description: 'Paste a public page and get its readable text: the article, not the menus, without the markup. Copy it or download a <code>.txt</code> file. Free, no sign-up.',
    tool: { crumb: 'Website to Text', text: true },
  },
  afterHero: conversionExample('text'),
  steps: { title: 'From a page to plain text.', cards: [
    ['01', 'Paste a public URL', 'Any page anyone can open without signing in: an article, documentation, a product page, a PDF. Five a day, no account.'],
    ['02', 'Octocrawl keeps the content', 'It reads the site’s robots.txt first, then the page, and keeps its main content, leaving out menus, headers and footers. Options can keep the whole page.'],
    ['03', 'Take the text', 'Headings, links and emphasis lose their marks, tables become tab-separated lines. Copy it, download a <code>.txt</code>, or switch to the Markdown.'],
  ] },
  uses: { title: 'Just the words.', lead: 'For when the markup is in the way: the page’s text, in reading order.', cards: [
    ['◇', 'Reading and quoting', 'Take an article’s text without ads, menus or pop-ups, to read, quote or translate.'],
    ['▤', 'Word counts and analysis', 'Feed a page’s text to a word counter, a readability check or your own script.'],
    ['⇢', 'Prompts and notes', 'Paste a page’s text into a chat or a note. For structure a model can use, <a href="/tools/url-to-markdown/">URL to Markdown</a> keeps the headings and tables.'],
  ] },
  unread: { title: 'An empty file is not an answer.', lead: 'Review the result state and the returned text before using it. A page read is not proof that your task is complete.', cards: UNREAD },
  code: { title: 'The same text, from your own tools.', format: 'markdown' },
  faq: [
    ['Is it free? Do I need an account?', 'Yes, and no. You get five pages a day without signing up (at most 150 a day for the whole site), reset at 00:00 UTC. A free account gets 1,000 credits a month for the hosted API, MCP and the Playground, and Octocrawl on your own computer has no limit.'],
    ['What is the difference from URL to Markdown?', 'The same read, shown two ways. Markdown keeps headings, lists, tables and links as marks a model or an editor understands; text drops the marks and keeps the words. The Markdown is one click away here too.'],
    ['What happens to tables, links and images?', 'A table becomes one line per row with its cells separated by tabs. A link keeps its text and loses its address; an image is left out. List items keep a dash.'],
    ['Does it work on pages that need JavaScript?', 'It reads the page as the server sends it and does not run scripts, so a page that draws its content in the browser can come back incomplete or empty, and the result says so. With a free account, the hosted API reads such pages in a browser.'],
    ['Can it extract text from a PDF?', 'Yes, from a PDF’s text layer, for files up to 5 MiB at a public URL. A scanned PDF without text comes back empty with the reason: it does no OCR.'],
    ['Do you keep the pages I convert?', 'No. Your results live in this page and are gone when you leave it. Each run logs its state and the host of the page, never its path, as the <a href="/docs/privacy/">privacy page</a> says.'],
  ],
}
