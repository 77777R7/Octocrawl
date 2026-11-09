import { CAPABILITIES, CLIENTS } from './featureSections'
import { FAQ, pageMarkup } from './page'
import { startListMarkup } from './startList'
import { BUILT_FOR, COST_LEAD, COST_ROWS, EVIDENCE_STEPS, FORMAT_CARDS, LADDER, SCRAPE_DESCRIPTION, SCRAPE_FAQ, SCRAPE_HEADING, SCRAPE_LEAD, SCRAPE_PATH } from './product/scrapePage'
import { TOOL_PAGES } from './tools/pages'
import { toolPagePath, type ToolPage } from './tools/toolPage'
import { codeWays, TOOLS, TOOLS_PATH, toolPath } from './tools/toolSections'
import { HUB_DESCRIPTION, HUB_FAQ, HUB_HEADING, HUB_LEAD } from './tools/toolsHub'

/** The Markdown copy published beside each Vite-built page (index.md: the home page, /scrape/, /tools/ and each free
 * tool), as build-docs.mjs publishes one beside every docs page and article. An agent or an assistant that asks for
 * Markdown reads the same words as the page, from the same lists, without its scripts, artwork or interactive card.
 * vite.config.ts writes them; build-docs.mjs lists them in llms.txt from their first two lines (`# title`, `> summary`).
 * Links to the site are root-relative (`/docs/…`), as in the docs' copies: the server fills in the origin in HTML, XML
 * and text files, not in Markdown (packages/public-preview server.ts ORIGIN_TEXT). A copy
 * says nothing the page does not: words only an agent reads would be content for bots alone (policy-gates.md G15). */

const ORIGIN = ''

const entities = (text: string): string => text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

/** A heading's words: the markup dropped, line breaks as spaces. */
export const plain = (html: string): string => entities(html.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

/** A line of the page's HTML as Markdown: links (root-relative, as on the page), code, emphasis; any other markup dropped. */
export function inlineMarkdown(html: string, path = '/'): string {
  const href = (target: string): string => target.startsWith('/') ? `${ORIGIN}${target}` : target.startsWith('#') ? `${ORIGIN}${path}${target}` : target
  return entities(html
    .replace(/<a\s[^>]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, target: string, text: string) => `[${plain(text)}](${href(target)})`)
    .replace(/<code>([\s\S]*?)<\/code>/g, '`$1`')
    .replace(/<\/?(?:em|i)>/g, '*')
    .replace(/<\/?(?:strong|b)>/g, '**')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** The page's opening: its heading, its one-line summary (llms.txt quotes it), and where the page itself is. */
const opening = (title: string, summary: string, path: string): string[] => [`# ${plain(title)}`, '', `> ${plain(summary)}`, '', `The page: ${ORIGIN}${path}`, '']

const faqSection = (title: string, faq: ReadonlyArray<readonly [string, string]>, path: string): string[] =>
  [`## ${title}`, '', ...faq.flatMap(([question, answer]) => [`### ${plain(question)}`, '', inlineMarkdown(answer, path), ''])]

const cardList = (cards: ReadonlyArray<readonly [string, string, string]>, path: string, numbered = false): string[] =>
  [...cards.map(([, head, text], i) => `${numbered ? `${i + 1}.` : '-'} **${plain(head)}**: ${inlineMarkdown(text, path)}`), '']

const fence = (code: string): string[] => ['```bash', code, '```', '']

/** A free tool's page: what it is, the same task from an agent or a script, how it works, who it is for, what it can't
 * read, and its questions. */
export function toolPageMarkdown(page: ToolPage): string {
  const path = toolPagePath(page)
  const ways = codeWays(page.code.format)
  return [
    ...opening(page.hero.title, page.description, path),
    `## ${plain(page.definition.question)}`, '', inlineMarkdown(page.definition.answer, path), '',
    `## ${plain(page.code.title)}`, '',
    ...ways.filter(([head]) => head !== 'Playground').flatMap(([head, text, code, href, link]) => [`**${head}.** ${inlineMarkdown(text, path)} [${link}](${ORIGIN}${href})`, '', ...fence(code)]),
    `## ${plain(page.steps.title)}`, '', ...cardList(page.steps.cards, path, true),
    `## ${plain(page.uses.title)}`, '', inlineMarkdown(page.uses.lead, path), '', ...cardList(page.uses.cards, path),
    `## ${plain(page.unread.title)}`, '', inlineMarkdown(page.unread.lead, path), '', ...cardList(page.unread.cards, path),
    ...faqSection('Questions', page.faq, path),
    `More free tools: ${TOOLS.filter(tool => tool.live && tool.slug !== page.slug).map(tool => `[${tool.name}](${ORIGIN}${toolPath(tool)})`).join(', ')}, [all free tools](${ORIGIN}${TOOLS_PATH}).`, '',
  ].join('\n')
}

/** The free tools' hub: the tools, and its questions. */
export function hubMarkdown(): string {
  return [
    ...opening(HUB_HEADING, HUB_DESCRIPTION, TOOLS_PATH),
    inlineMarkdown(HUB_LEAD, TOOLS_PATH), '',
    '## The tools', '',
    ...TOOLS.filter(tool => tool.live).map(tool => `- [${tool.name}](${ORIGIN}${toolPath(tool)}index.md): ${inlineMarkdown(tool.text, TOOLS_PATH)}`), '',
    ...faqSection('Questions', HUB_FAQ, TOOLS_PATH),
  ].join('\n')
}

/** /scrape/: what a scrape returns, who it is for, how it reads a page, its Evidence Record, what it costs, questions.
 * The live demo and the in-browser hash check are left out: they need the page. */
export function scrapeMarkdown(): string {
  const path = SCRAPE_PATH
  return [
    ...opening(SCRAPE_HEADING, SCRAPE_DESCRIPTION, path),
    inlineMarkdown(SCRAPE_LEAD, path), '',
    '## What you get', '', ...FORMAT_CARDS.map(card => `- **${plain(card.title).replace(/\.$/, '')}** (${plain(card.eyebrow)}): ${inlineMarkdown(card.text, path)}`), '',
    '## Built for', '', ...BUILT_FOR.map(card => `- **${plain(card.title)}** (${plain(card.label)}): ${inlineMarkdown(card.text, path)}`), '',
    '## How it reads a page', '', ...LADDER.map((step, i) => `${i + 1}. **${plain(step.title)}**: ${inlineMarkdown(step.text, path)} (${step.meta.map(plain).join('; ')})`), '',
    '## The Evidence Record', '', ...EVIDENCE_STEPS.filter(([title]) => title !== 'Check it yourself').map(([title, text]) => `- **${plain(title)}**: ${inlineMarkdown(text, path)}`), '',
    '## What it costs', '', inlineMarkdown(COST_LEAD, path), '', '| Result | Credits |', '| --- | --- |', ...COST_ROWS.map(([result, credits]) => `| ${result} | ${credits} |`), '',
    ...faqSection('Questions', SCRAPE_FAQ, path),
    `Try a page of your own: [URL to Markdown](${ORIGIN}/tools/url-to-markdown/), five a day without signing up.`, '',
  ].join('\n')
}

/** The home page: its heading, what it does and where each part runs, its Get started window, where to go next, and
 * its questions. The heading and the where-to-next rows are read from the page's own markup (pageMarkup,
 * startListMarkup), so the home page's files stay as they are. */
export function homeMarkdown(): string {
  const path = '/'
  const page = pageMarkup()
  const title = /<h1 id="hero-title">([\s\S]*?)<\/h1>/.exec(page)?.[1]
  const summary = /<p class="hero-description">([\s\S]*?)<\/p>/.exec(page)?.[1]
  const rows = [...startListMarkup().matchAll(/<a class="start-row" href="([^"]+)"><span class="start-row-text"><strong>([\s\S]*?)<\/strong><span>([\s\S]*?)<\/span><\/span><span class="start-row-action">([\s\S]*?)<span/g)]
  if (!title || !summary || !rows.length) throw new Error('the home page’s heading, summary or where-to-next rows have moved')
  const window = (lines: (typeof CLIENTS)[number]['lines']): string => lines.filter(([kind]) => kind !== 'out').map(([, text]) => text).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const language: Record<string, string> = { ts: 'ts', py: 'python' }
  return [
    ...opening(title, summary, path),
    '## What it does', '', ...CAPABILITIES.map(c => `- **${plain(c.title)}** (${plain(c.where)}): ${inlineMarkdown(c.text, path)}`), '',
    '## Get started', '',
    ...CLIENTS.flatMap(c => [`**${c.label}.** ${inlineMarkdown(c.note, path)}`, '', `\`\`\`${language[c.key] ?? 'bash'}`, window(c.lines), '\`\`\`', '']),
    ...rows.map(([, href, head, text, action]) => `- **${plain(head!)}**: ${inlineMarkdown(text!, path)} [${plain(action!)}](${href})`), '',
    ...faqSection('Questions', FAQ, path),
    `Free tools: ${TOOL_PAGES.map(page => `[${page.name}](${ORIGIN}${toolPagePath(page)})`).join(', ')}. Documentation: ${ORIGIN}/docs/.`, '',
  ].join('\n')
}

/** Every Vite-built page's Markdown copy, by the path it is published at. */
export function markdownTwins(): ReadonlyArray<readonly [file: string, text: string]> {
  return [
    ['index.md', homeMarkdown()],
    ['scrape/index.md', scrapeMarkdown()],
    ['tools/index.md', hubMarkdown()],
    ...TOOL_PAGES.map(page => [`${toolPagePath(page).slice(1)}index.md`, toolPageMarkdown(page)] as const),
  ]
}
