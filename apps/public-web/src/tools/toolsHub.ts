import { footerMarkup, siteHeaderMarkup } from '../page'
import { TOOLS, TOOLS_PATH, fromCodeCards, toolBanner, toolCards, toolPath, toolSection } from './toolSections'

/** /tools/: Octocrawl's free tools in one place, under a banner of the coast (the artwork the tool pages share). Live
 * tools link to their page; the next ones are listed as coming, linking nowhere. vite.config.ts prerenders this markup
 * into tools/index.html; hubMain.ts runs the header's and analytics' scripts. */

export const HUB_TITLE = 'Free Web Data Tools: URL to Markdown and More | Octocrawl'
export const HUB_DESCRIPTION = 'Free tools that read a public web page in your browser: URL to Markdown, and more coming. No sign-up, five a day, and when a page can’t be read you get the reason.'

export const HUB_FAQ: ReadonlyArray<readonly [question: string, answer: string]> = [
  ['Are these tools free?', 'Yes. Every tool here runs in your browser without an account: five pages a day per visitor (at most 150 a day for the whole site), reset at 00:00 UTC.'],
  ['Do I need an account?', 'No. Sign in when you want more: a free account gets 1,000 credits a month for the hosted API, MCP and the Playground, which also reads pages that need a browser. No card.'],
  ['Can I use them from code or an agent?', 'Yes. The same reads are one call to the hosted API (<code>api.octocrawl.dev</code>) or the MCP server (<code>mcp.octocrawl.dev</code>), or run <code>npx octocrawl serve</code> on your own computer with no limit.'],
  ['What happens when a page can’t be read?', 'You get the reason instead of an empty file: the site’s robots.txt disallows it, it blocks the request, it needs a login, or it draws its content with JavaScript, which these free tools don’t run.'],
]

export function hubJsonLd(): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Octocrawl free tools',
    url: `__W2L_ORIGIN__${TOOLS_PATH}`,
    description: HUB_DESCRIPTION,
    hasPart: TOOLS.filter((tool) => tool.live).map((tool) => ({ '@type': 'SoftwareApplication', name: tool.name, url: `__W2L_ORIGIN__${toolPath(tool)}`, applicationCategory: 'DeveloperApplication', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } })),
  }
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

function toolCard(tool: (typeof TOOLS)[number]): string {
  const body = `<span class="hub-glyph" aria-hidden="true">${tool.glyph}</span><span class="hub-name">${tool.name}</span><span class="hub-text">${tool.text}</span><span class="hub-meta">${tool.live ? 'Free · no sign-up <span aria-hidden="true">→</span>' : 'Coming next'}</span>`
  return tool.live ? `<li class="hub-card"><a class="hub-link" href="${toolPath(tool)}">${body}</a></li>` : `<li class="hub-card is-next" aria-label="${tool.name}, coming next">${body}</li>`
}

export function hubPageMarkup(): string {
  return `
  <div class="page-shell tools-hub">
    <div class="hub-hero" id="top">
      <div class="hub-backdrop" aria-hidden="true"></div>
${siteHeaderMarkup()}      <main aria-labelledby="hub-title">
        <div class="band">
          <div class="frame hub-copy">
            <p class="hub-kicker"><span class="kicker-square" aria-hidden="true"></span>Free tools</p>
            <h1 id="hub-title">Free web data tools, <em>no sign-up.</em></h1>
            <p class="hub-lead">Paste a public page and take what you need from it, in your browser. Five a day, and when a page can’t be read, you get the reason.</p>
          </div>
        </div>
      </main>
    </div>

    <section class="hub-list" aria-labelledby="hub-list-title">
      <div class="band">
        <div class="frame">
          <h2 class="visually-hidden" id="hub-list-title">The tools</h2>
          <ul class="hub-grid" role="list">${TOOLS.map(toolCard).join('')}</ul>
        </div>
      </div>
    </section>
${toolSection('how', 'HOW THEY WORK', 'Paste, read, take.', toolCards([
  ['01', 'Paste a public URL', 'Any page anyone can open without signing in. No account, no key, no install.'],
  ['02', 'Octocrawl checks, then reads', 'It reads the site’s robots.txt first, then the page over HTTP, and keeps what the tool is for.'],
  ['03', 'Copy or download', 'Take the result as text or a file. If the page can’t be read, the reason comes instead of an empty file.'],
]))}${toolSection('from-code', 'FROM YOUR CODE OR AGENT', 'The same reads, one call away.', fromCodeCards(), 'For more than five a day, a whole site, or inside your agent.')}
    <section class="faq-section" id="faq" aria-labelledby="faq-title">
      <div class="band">
        <div class="frame faq-grid">
          <div class="faq-intro">
            <p class="section-kicker"><span class="kicker-square"></span> FAQ</p>
            <h2 id="faq-title">Free tools,<br />answered <em>plainly.</em></h2>
          </div>
          <div class="faq-list">${HUB_FAQ.map(([question, answer]) => `<details class="faq-item"><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div>
        </div>
      </div>
    </section>
${toolBanner()}
${footerMarkup('/', false)}  </div>
`
}
