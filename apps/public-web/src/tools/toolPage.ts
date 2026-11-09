import { glyphCloud } from '../glyphArt'
import { footerMarkup, heroMarkup, type HeroCopy } from '../page'
import { codeWays, fromCodeCards, moreToolsChips, toolBanner, toolCards, toolSection, type CodeFormat } from './toolSections'

/** A free tool's page, from its words: the short coast strip and the home page's card set up for the tool
 * (page.ts, heroMarkup `tool`), then the free tools' sections (toolSections.ts) and the tool's questions. main.ts runs
 * the card as on the home page. vite.config.ts prerenders each page into tools/<slug>/index.html. */

type Cards = ReadonlyArray<readonly [mark: string, head: string, text: string]>
export type ToolPage = {
  slug: string
  name: string
  // The document's title and description (tools/<slug>/index.html carries the same).
  docTitle: string
  description: string
  hero: { title: string; description: string; tool: NonNullable<HeroCopy['tool']> }
  // What the tool is, in a sentence or two that name Octocrawl and what the tool keeps and leaves out, answering the
  // question as a person would ask it. Shown right under the card, with the same task in one line from an agent or a
  // script, and first in the page's Markdown copy (markdownTwin.ts): the sentence an assistant can quote.
  definition: { question: string; answer: string }
  steps: { title: string; cards: Cards }
  uses: { title: string; lead: string; cards: Cards }
  unread: { title: string; lead: string; cards: Cards }
  code: { title: string; format: CodeFormat }
  faq: ReadonlyArray<readonly [question: string, answer: string]>
  // Markup right under the card, before the results (Link Extractor's whole-site results).
  afterHero?: string
}

export const toolPagePath = (page: ToolPage): string => `/tools/${page.slug}/`

/** The page's structured data: the tool as a free web application. */
export function toolPageJsonLd(page: ToolPage): string {
  const data = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: `Octocrawl ${page.name}`, url: `__W2L_ORIGIN__${toolPagePath(page)}`, description: page.description, applicationCategory: 'DeveloperApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

/** The same task in one line, under the definition: in an agent (MCP), and from a script (REST), each as the
 * from-code cards write it. */
function oneLiners(format: CodeFormat): string {
  const ways = codeWays(format)
  const line = (head: string, label: string): string => {
    const code = ways.find(([name]) => name === head)![2]
    return `<li><span>${label}</span><code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></li>`
  }
  return `<ul class="tl-oneliners" role="list">${line('MCP', 'In your agent: Claude Code (Cursor, Codex and others in <a href="/docs/connect-mcp/">Connect MCP</a>). No key for 20 pages a day.')}${line('REST API', 'From a script, with the same daily allowance:')}</ul>`
}

export function toolPageMarkup(page: ToolPage): string {
  return `
  <div class="page-shell tool-page">
${heroMarkup({ title: page.hero.title, description: page.hero.description, next: '#how', nextLabel: 'See how it works', art: 'coast', tool: page.hero.tool })}${page.afterHero ?? ''}${toolSection('what', 'WHAT IT IS', page.definition.question, oneLiners(page.code.format), page.definition.answer)}${toolSection('how', 'HOW IT WORKS', page.steps.title, toolCards(page.steps.cards))}${toolSection('uses', 'WHO IT IS FOR', page.uses.title, toolCards(page.uses.cards), page.uses.lead)}${toolSection('unread', 'WHEN A PAGE CAN’T BE READ', page.unread.title, toolCards(page.unread.cards, page.unread.cards.length === 4 ? 'is-four' : ''), page.unread.lead)}${toolSection('from-code', 'FROM YOUR CODE OR AGENT', page.code.title, fromCodeCards(page.code.format), 'Every answer carries its <a href="/docs/reference/#evidence-record">Evidence Record</a>: where the page came from, when, and hashes of what was read.')}${toolSection('more-tools', 'MORE FREE TOOLS', 'Other things to take from a page.', moreToolsChips(page.slug))}
    <section class="faq-section" id="faq" aria-labelledby="faq-title">
      <div class="band">
        <div class="frame faq-grid">
          <div class="faq-intro">
            <pre class="glyph-cloud is-side" data-cols="70" data-rows="34" data-seed="5" aria-hidden="true">${glyphCloud(70, 34, 5)}</pre>
            <p class="section-kicker"><span class="kicker-square"></span> FAQ</p>
            <h2 id="faq-title">Questions,<br />answered <em>plainly.</em></h2>
          </div>
          <div class="faq-list">${page.faq.map(([question, answer]) => `<details class="faq-item"><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div>
        </div>
      </div>
    </section>
${toolBanner()}
${footerMarkup('/', false)}  </div>
`
}
