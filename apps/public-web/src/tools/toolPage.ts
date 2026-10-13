import { glyphCloud } from '../glyphArt'
import { footerMarkup, heroMarkup, type HeroCopy } from '../page'
import { fromCodeCards, moreToolsChips, toolBanner, toolCards, toolSection, type CodeFormat } from './toolSections'

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

export function toolPageMarkup(page: ToolPage): string {
  return `
  <div class="page-shell tool-page">
${heroMarkup({ title: page.hero.title, description: page.hero.description, next: '#how', nextLabel: 'See how it works', art: 'coast', tool: page.hero.tool })}${page.afterHero ?? ''}${toolSection('how', 'HOW IT WORKS', page.steps.title, toolCards(page.steps.cards))}${toolSection('uses', 'WHO IT IS FOR', page.uses.title, toolCards(page.uses.cards), page.uses.lead)}${toolSection('unread', 'WHEN A PAGE CAN’T BE READ', page.unread.title, toolCards(page.unread.cards, page.unread.cards.length === 4 ? 'is-four' : ''), page.unread.lead)}${toolSection('from-code', 'FROM YOUR CODE OR AGENT', page.code.title, fromCodeCards(page.code.format), 'Every answer carries its <a href="/docs/reference/#evidence-record">Evidence Record</a>: where the page came from, when, and hashes of what was read.')}${toolSection('more-tools', 'MORE FREE TOOLS', 'Other things to take from a page.', moreToolsChips(page.slug))}
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
