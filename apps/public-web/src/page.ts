import { capabilitiesMarkup, startMarkup } from './featureSections'
import { glyphBand, glyphCloud } from './glyphArt'
import { waitlistMarkup } from './waitlistMarkup'
import { siteActionsMarkup, siteNavMarkup } from '../scripts/siteNav.mjs'

/** Light sections in page order. Each gets a `[ 0N / 0M ]` bar numbered from this list, so adding or moving a
 * section renumbers the rest. The bar repeats the section's kicker, so screen readers skip it. */
const SECTION_BARS = [
  ['what-it-does', 'WHAT IT DOES'],
  ['get-started', 'GET STARTED'],
  ['faq', 'FAQ'],
] as const

const pad2 = (n: number) => String(n).padStart(2, '0')

export function renderSectionBar(index: number, total: number, label: string): string {
  return `<div class="band"><div class="frame section-bar" aria-hidden="true"><span>[ <b>${pad2(index + 1)}</b> / ${pad2(total)} ]</span><span>·</span><span class="section-bar-label">${label}</span></div></div>`
}

export function sectionBar(id: (typeof SECTION_BARS)[number][0]): string {
  const index = SECTION_BARS.findIndex(([key]) => key === id)
  return renderSectionBar(index, SECTION_BARS.length, SECTION_BARS[index][1])
}



/** The FAQ: each question with its answer (HTML). The section shows them, and the page's FAQPage data repeats them,
 * so the two cannot drift apart. */
export const FAQ: ReadonlyArray<readonly [question: string, answer: string]> = [
  ["Does Octocrawl respect robots.txt? Is this legal?", "We can’t give legal advice; here is what the preview does. It reads a site’s robots.txt before it fetches a page. If the page is disallowed, or robots.txt can’t be reached (a server error, no answer or a timeout), it stops and reports the page as blocked; a robots.txt that answers with a 4xx status counts as no rules, as RFC 9309 provides. It never signs in, solves a CAPTCHA or gets past a verification page, and it refuses private network addresses. What you do with a page is up to you and the site’s terms."],
  ["Which sites work?", "Public pages anyone can open without signing in. The preview reads them over HTTP without running JavaScript, so a page that only appears in a browser may come back incomplete. It reads pages up to 2 MiB and files such as PDFs up to 5 MiB, and stops after 40 seconds. Amazon.sg product pages (<code>/dp/ASIN</code>) are in Beta. X and Reddit posts often don’t come through: robots rules, sign-in walls or verification pages can stop the preview, and a hosted X or Reddit result hasn’t been verified yet. See <a href=\"/docs/limits/\">Limits and result states</a>."],
  ["Why only five previews a day?", "The preview is a limited public trial: five previews per visitor and 150 for the whole site each UTC day. A request turned down before a preview starts, such as a malformed URL, or localhost or a private IP address typed into it, doesn’t count. Once a preview starts it counts, whatever the result, including a host name that turns out to point to a private network or a page stopped by robots.txt. Octocrawl on your own computer has no daily limit."],
  ["Do you store the URLs I submit, or the results?", "Results aren’t saved: your recent runs live in this page and are gone when you leave it. Each preview logs its state and the host of the page, never its path. While you type, the page asks the service for a short hint about the address. That request sends the address in its body; the hosting request log records the request path, not its body. Visit and outcome logs are kept for 30 days. The details are on the <a href=\"/docs/privacy/\">Privacy</a> page."],
  ["How is Octocrawl different from Firecrawl or Crawl4AI?", "Octocrawl reports what it actually read: a blocked, incomplete or timed-out page is a result with a reason, and checked fields carry their source. The <a href=\"https://github.com/77777R7/Octocrawl/blob/main/docs/benchmark-gate.md\">benchmark notes</a> compare the three tools on the same test suite, with the limits of that comparison. For moving off Firecrawl, see the <a href=\"/blog/firecrawl-v1-migration/\">local v1 migration guide</a>: a partial shim, not a v2 drop-in replacement."],
  ["Can I call it from a script or an agent?", "Not this preview page: it is for trying Octocrawl in a browser. Call <a href=\"/docs/connect-mcp/\">hosted Octocrawl</a> instead: <code>https://api.octocrawl.dev/v1/scrape</code> over REST, or <code>https://mcp.octocrawl.dev/mcp</code> from Claude Code, Cursor, OpenCode or Codex, keyless within a daily allowance and with a key for more. Or run Octocrawl yourself with no limit."],
  ["Is it free?", "Yes, to start. This preview (five a day) and hosted Octocrawl without a key (20 pages a day per address) need no account. <a href=\"/signin/\">Signing in</a> is free and needs no card: it gives 1,000 credits a month for the hosted API and MCP, and API keys you make yourself in the dashboard. A page read over HTTP costs 1 credit and one read in a browser 5; a blocked page costs nothing. Credit packs for more are planned but not sold yet. Octocrawl is open source under the AGPL-3.0, and running it yourself costs nothing but your own machine."],
]

/** The FAQ as schema.org FAQPage data, in plain text, for the page's head (vite.config.ts writes it there). `<` is
 * escaped so no answer can close the script element. */
export function faqJsonLd(): string {
  const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  const data = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: FAQ.map(([question, answer]) => ({ '@type': 'Question', name: text(question), acceptedAnswer: { '@type': 'Answer', text: text(answer) } })),
  }
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

/** The page's markup. The build writes it into index.html (see vite.config.ts), so the headline, the form and every
 * section are in the HTML itself: readable before any script runs, by search engines and by LLM readers alike.
 * It must stay free of DOM access and styles, because it runs in Node at build time. */
export function pageMarkup(): string {
  return `
  <div class="page-shell">
${heroMarkup(HOME_HERO)}    ${capabilitiesMarkup(sectionBar('what-it-does'))}
    ${startMarkup(sectionBar('get-started'))}
    <section class="faq-section" id="faq" aria-labelledby="faq-title">
      ${sectionBar('faq')}
      <div class="band">
        <div class="frame faq-grid">
          <div class="faq-intro">
            <pre class="glyph-cloud is-side" data-cols="70" data-rows="34" data-seed="5" aria-hidden="true">${glyphCloud(70, 34, 5)}</pre>
            <p class="section-kicker"><span class="kicker-square"></span> FAQ</p>
            <h2 id="faq-title">Questions,<br />answered <em>plainly.</em></h2>
          </div>
          <div class="faq-list">${FAQ.map(([question, answer]) => `<details class="faq-item"><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div>
        </div>
      </div>
    </section>

${footerMarkup()}  </div>
`
}

/** The site's footer. On the home page its section links stay on the page; elsewhere `home` is "/" and they go there.
 * The early-access form comes only where its script runs (main.ts, mountWaitlist). */
export function footerMarkup(home = '', waitlist = true): string {
  return `    <footer class="site-footer">
${waitlist ? `      ${waitlistMarkup()}\n` : ''}      <div class="band band-dark">
        <div class="frame footer-top">
          <div class="footer-brand-cell">
            <a class="brand footer-brand" href="/" aria-label="Octocrawl home"><img class="brand-mark" src="/assets/octopus-160.webp" alt="" width="40" height="40" /><img class="brand-name" src="/assets/octocrawl-wordmark.svg" alt="" width="122" height="20" /></a>
            <p class="footer-tagline">Start with one link.</p>
            <p class="footer-note">Open-source web data you can cite</p>
          </div>
          <div class="footer-cards">
            <a class="footer-card is-primary" href="#top"><span class="footer-card-mark" aria-hidden="true">→</span>Try a page<span class="card-arrow" aria-hidden="true">↑</span></a>
            <a class="footer-card" href="https://github.com/77777R7/Octocrawl"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>Star on GitHub<span class="card-arrow" aria-hidden="true">↗</span></a>
            <a class="footer-card" href="/docs/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>Documentation<span class="card-arrow" aria-hidden="true">↗</span></a>
          </div>
        </div>
      </div>
      <div class="band band-dark">
        <nav class="frame footer-columns" aria-label="Footer">
          <div class="footer-col"><p class="footer-heading">Product</p><ul><li><a href="#top">Try Octocrawl</a></li><li><a href="${home}#what-it-does">What it does</a></li><li><a href="${home}#get-started">Get started</a></li><li><a href="/tools/">Free tools</a></li><li><a href="${home}#faq">FAQ</a></li><li><a href="/blog/">Blog</a></li><li><a href="/changelog/">Changelog</a></li></ul></div>
          <div class="footer-col"><p class="footer-heading">Docs</p><ul><li><a href="/docs/guides/amazon-product/">Amazon.sg product JSON</a></li><li><a href="/docs/guides/monitor-webhook/">Monitor to HTTPS Webhook</a></li><li><a href="/docs/connect-mcp/">Connect MCP</a></li><li><a href="/docs/limits/">Limits and result states</a></li><li><a href="/docs/reference/">Advanced reference</a></li><li><a href="/llms.txt">llms.txt</a></li></ul></div>
          <div class="footer-col"><p class="footer-heading">Legal</p><ul><li><a href="/docs/terms/">Terms of use</a></li><li><a href="/docs/acceptable-use/">Acceptable use</a></li><li><a href="/docs/privacy/">Privacy</a></li><li><a href="https://github.com/77777R7/Octocrawl/blob/main/LICENSE">AGPL-3.0 license ↗</a></li></ul></div>
          <div class="footer-col"><p class="footer-heading">Contact</p><ul><li><a href="mailto:hello@octocrawl.dev">hello@octocrawl.dev</a></li><li><a href="https://github.com/77777R7/Octocrawl/issues">GitHub issues ↗</a></li><li><a href="https://github.com/77777R7/Octocrawl">GitHub repository ↗</a></li><li><a href="/docs/contact/">Contact page</a></li><li><a href="#top">Back to top ↑</a></li></ul></div>
        </nav>
      </div>
    </footer>
`
}

/** The site's header band (brand, navigation, GitHub and Sign in), at the top of the home page, the free tool pages and
 * the product pages. */
export function siteHeaderMarkup(): string {
  return `      <div class="band band-dark band-header">
        <header class="frame site-header">
          <a class="brand" href="/" aria-label="Octocrawl home">
            <img class="brand-mark" src="/assets/octopus-160.webp" alt="" width="50" height="50" />
            <img class="brand-name" src="/assets/octocrawl-wordmark.svg" alt="" width="140" height="23" />
          </a>
          ${siteNavMarkup()}
          ${siteActionsMarkup()}
        </header>
      </div>
`
}

/** The hero's words: what the page is for, and where its scroll cue leads before the first run; and the artwork
 * behind it, the mountain unless it names another (heroArtwork.ts, SCENES). */
export interface HeroCopy {
  title: string
  description: string
  next: string
  nextLabel: string
  art?: 'coast'
  // A free tool's page: a short strip of the artwork with the tool's name under a breadcrumb (`crumb`), and the card
  // right below it, without the home page's full-screen artwork, octopus and glyph light.
  tool?: {
    crumb: string
    // What the card starts with on this tool's page: a view, the whole page rather than its main content, an example
    // URL for Try an example, and (Website to Text) the Markdown shown as plain text.
    view?: 'links' | 'info' | 'fields' | 'json'
    whole?: boolean
    example?: string
    text?: boolean
    // Link Extractor: a Whole site / This page switch over the card; whole site reads the site's pages (/api/map).
    map?: boolean
  }
}
/** The agents the MCP guide sets up, drawn small beside Connect your agent (main.ts, from agentOctopus.ts's marks). */
const AGENT_NAMES = ['Claude Code', 'Codex', 'Cursor', 'OpenCode']
const HOME_HERO: HeroCopy = {
  title: 'Turn web pages into <br /><em>data your agents can use.</em>',
  description: 'Clean Markdown and structured data from public pages, each with a receipt.',
  next: '#what-it-does',
  nextLabel: 'See what it does',
}

/** The hero (the URL card, its panels, the crawl window) and the results under it: the home page's, and each free
 * tool page's with its own words (src/tools/*.ts). main.ts runs them on either page. */
export function heroMarkup(copy: HeroCopy): string {
  const decoration = copy.tool ? '' : `
      <div class="hero-glyphs" id="hero-glyphs" aria-hidden="true"></div>
      <div class="hero-octopus-static" aria-hidden="true"></div>`
  const heading = copy.tool ? `
          <div class="frame hero-tool-head">
            <nav class="tool-crumbs" aria-label="Breadcrumb"><a href="/tools/">Free tools</a><span aria-hidden="true">/</span><span aria-current="page">${copy.tool.crumb}</span></nav>
            <h1 id="hero-title">${copy.title}</h1>
            <p class="hero-description">${copy.description}</p>${copy.tool.map ? `
            <div class="map-mode" role="radiogroup" aria-label="What to read"><button type="button" role="radio" aria-checked="true" data-map-mode="site">Whole site</button><button type="button" role="radio" aria-checked="false" data-map-mode="page">This page</button></div>` : ''}
          </div>` : `
          <div class="frame hero-cells">
            <div class="hero-octopus-cell" id="hero-ascii" data-calm="#hero-title, .hero-description, .hero-ctas" data-calm-depth="0.4" data-calm-feather="120" data-reach=".url-card" aria-hidden="true"></div>
            <div class="hero-cell hero-copy">
              <h1 id="hero-title">${copy.title}</h1>
              <p class="hero-description">${copy.description}${copy === HOME_HERO ? ' <span class="hero-chip" id="hero-chip"><span class="hero-chip-text">It’s also open source!</span><span class="hero-chip-ascii" aria-hidden="true"></span></span>' : ''}</p>${copy === HOME_HERO ? `
              <p class="hero-ctas"><a class="hero-cta is-primary" href="/signin/">Start for free</a><a class="hero-cta" href="/docs/connect-mcp/"><span class="hero-agents" aria-hidden="true">${AGENT_NAMES.map((name, i) => `<canvas class="hero-agent" data-agent="${i}" title="${name}"></canvas>`).join('')}</span>Connect your agent</a></p>` : ''}
            </div>
          </div>`
  const presets = copy.tool ? `${copy.tool.view ? ` data-tool-view="${copy.tool.view}"` : ''}${copy.tool.whole ? ' data-tool-scope="whole"' : ''}${copy.tool.example ? ` data-tool-example="${copy.tool.example}"` : ''}${copy.tool.text ? ' data-tool-text="on"' : ''}${copy.tool.map ? ' data-tool-map="site"' : ''}` : ''
  return `    <div class="hero${copy.tool ? ' is-tool' : ''}" id="top"${copy.art ? ` data-art="${copy.art}"` : ''}${presets}>
      <div class="hero-backdrop" aria-hidden="true"></div>${decoration}
      <div class="hero-shade" aria-hidden="true"></div>${copy.tool ? '' : `
      <div class="hero-click-spark" id="hero-click-spark" aria-hidden="true"></div>`}

${siteHeaderMarkup()}
      <main aria-labelledby="hero-title">
        <div class="band band-dark">${heading}
        </div>
        <div class="band band-dark">
          <div class="frame hero-form-row">
            <form class="url-form" id="preview-form" novalidate>
              <label class="visually-hidden" for="url-input">Public web page URL</label>
              <div class="url-card">
                <div class="url-entry">
                  <span class="url-chip" aria-hidden="true">URL</span>
                  <input id="url-input" name="url" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="Paste a public page URL…" aria-describedby="url-help capability-message form-message" required />
                </div>
                <div class="url-toolbar">
                  <div class="url-tools">
                    <button class="tool-button" id="format-button" type="button" popovertarget="format-panel" aria-haspopup="dialog"><span class="tool-icon tool-icon-format" aria-hidden="true"></span><span class="visually-hidden">Output format: </span><span id="format-label">${copy.tool?.text ? 'Text' : 'Markdown'}</span><span class="tool-caret" aria-hidden="true"></span></button>
                    <button class="tool-button" id="options-button" type="button" popovertarget="options-panel" aria-haspopup="dialog"><span class="tool-icon tool-icon-options" aria-hidden="true"></span><span class="tool-text">Options</span><span class="tool-badge" id="options-badge" hidden></span></button>
                  </div>
                  <button class="tool-button" id="code-button" type="button" aria-haspopup="dialog"><span class="tool-icon tool-icon-code" aria-hidden="true">&lt;/&gt;</span><span class="tool-text">Get code</span></button>
                  <button class="example-button" id="example-button" type="button">Try an example</button>
                  <button class="submit-button" id="submit-button" type="submit"><span id="submit-label">Extract page</span><span class="button-arrow" aria-hidden="true">→</span></button>
                </div>
                <div class="crawl-window" id="crawl-window" hidden>
                  <div class="crawl-stage">
                    <canvas class="crawl-canvas" aria-hidden="true"></canvas>
                    <div class="crawl-top">
                      <span class="crawl-url" id="crawl-url"></span>
                      <label class="crawl-always"><input type="checkbox" id="crawl-always-skip" /> Always skip</label>
                      <button class="crawl-skip" id="crawl-skip" type="button">Skip <span class="crawl-esc" aria-hidden="true">esc</span></button>
                    </div>
                    <p class="crawl-note" id="crawl-note" hidden></p>
                    <div class="crawl-foot"><span class="crawl-label" id="crawl-label"></span><span class="crawl-time" id="crawl-time"></span></div>
                  </div>
                  <p class="visually-hidden" id="crawl-status" role="status" aria-live="polite"></p>
                </div>
              </div>
              <p class="form-message" id="form-message" role="status" aria-live="polite"></p>
              <p class="capability-message" id="capability-message" role="status" aria-live="polite"></p>
              <p class="url-help" id="url-help"><span id="quota-note">5 free previews a day</span> · Public pages only · <a class="url-help-link" href="/docs/connect-mcp/">Use it from your agent <span aria-hidden="true">↗</span></a></p>
              <div class="sheet format-sheet" id="format-panel" popover role="dialog" aria-labelledby="format-title">
                <div class="sheet-head">
                  <p class="sheet-title" id="format-title"><span class="kicker-square" aria-hidden="true"></span>Format</p>
                  <span class="sheet-esc" aria-hidden="true">esc</span>
                  <button class="sheet-close" type="button" popovertarget="format-panel" popovertargetaction="hide" aria-label="Close format"></button>
                </div>
                <div class="sheet-scroll">
                  <div class="format-tiles" role="radiogroup" aria-labelledby="format-title">
                    <label class="format-tile"><input type="radio" name="output-view" value="markdown" checked /><span class="tile-icon" data-icon="markdown" aria-hidden="true"></span>${copy.tool?.text ? '<span class="tile-name">Text</span><span class="tile-note">plain text, or Markdown</span><span class="tile-ext">.txt</span>' : '<span class="tile-name">Markdown</span><span class="tile-note">readable text</span><span class="tile-ext">.md</span>'}</label>
                    <label class="format-tile"><input type="radio" name="output-view" value="links" /><span class="tile-icon" data-icon="links" aria-hidden="true"></span><span class="tile-name">Links</span><span class="tile-note">every link, up to 500</span><span class="tile-ext">.links.txt</span></label>
                    <label class="format-tile"><input type="radio" name="output-view" value="info" /><span class="tile-icon" data-icon="info" aria-hidden="true"></span><span class="tile-name">Page info</span><span class="tile-note">title, language; a file's pages</span><span class="tile-ext">.info.json</span></label>
                    <label class="format-tile"><input type="radio" name="output-view" value="fields" /><span class="tile-icon" data-icon="fields" aria-hidden="true"></span><span class="tile-name">Fields</span><span class="tile-note">the fields set in Options</span><span class="tile-ext">.fields.json</span></label>
                    <label class="format-tile"><input type="radio" name="output-view" value="json" /><span class="tile-icon" data-icon="json" aria-hidden="true"></span><span class="tile-name">JSON</span><span class="tile-note">the whole result</span><span class="tile-ext">.json</span></label>
                  </div>
                  <p class="sheet-note">All from one extraction, so switching never uses another preview.</p>
                </div>
              </div>
              <div class="sheet options-sheet" id="options-panel" popover role="dialog" aria-labelledby="options-title">
                <div class="sheet-head">
                  <p class="sheet-title" id="options-title"><span class="kicker-square" aria-hidden="true"></span>Options</p>
                  <span class="sheet-esc" aria-hidden="true">esc</span>
                  <button class="sheet-close" type="button" popovertarget="options-panel" popovertargetaction="hide" aria-label="Close options"></button>
                </div>
                <div class="sheet-scroll">
                  <div class="sheet-section read-section">
                    <p class="sheet-label" id="read-title">Read</p>
                    <div class="read-body">
                      <div class="scope-choice" id="content-scope" role="radiogroup" aria-labelledby="read-title" aria-describedby="content-note">
                        <label class="scope-option"><input type="radio" name="content-scope" id="content-main" value="main" checked /><span class="row-mark" aria-hidden="true"></span>Main content</label>
                        <label class="scope-option"><input type="radio" name="content-scope" id="content-whole" value="whole" /><span class="row-mark" aria-hidden="true"></span>Whole page</label>
                      </div>
                      <p class="sheet-hint" id="content-note"></p>
                    </div>
                  </div>
                  <section class="sheet-section fields-section" aria-labelledby="fields-title">
                    <div class="fields-head">
                      <p class="sheet-label" id="fields-title">Fields</p>
                      <span class="fields-count" id="fields-count" aria-hidden="true"></span>
                      <span class="visually-hidden" id="fields-count-text" aria-live="polite"></span>
                      <button class="sheet-link" id="fields-preset" type="button" aria-label="Use the product fields: name, brand, price, currency, availability, SKU, rating and review count">+ product fields</button>
                    </div>
                    <div class="fields-list" id="fields-list" role="list" aria-labelledby="fields-title"></div>
                    <div class="field-new">
                      <span class="field-prompt" aria-hidden="true">›</span>
                      <input class="field-new-name" id="field-new" maxlength="64" autocomplete="off" spellcheck="false" aria-label="New field name" />
                      <button class="sheet-link" id="field-add" type="button">add</button>
                    </div>
                    <p class="option-error" id="fields-error" role="alert"></p>
                  </section>
                  <p class="sheet-note">Read from the page itself: JSON-LD, microdata, meta tags, tables and a PDF's "Label: value" lines. No AI: a field the page does not state comes back empty, with the reason.<br />PDFs up to 5 MiB · Amazon.sg product pages take no options.</p>
                </div>
              </div>
              <dialog class="code-dialog" id="code-dialog" aria-labelledby="code-title" aria-describedby="code-lead">
                <div class="sheet-head">
                  <p class="sheet-title"><span class="kicker-square" aria-hidden="true"></span>Get code</p>
                  <span class="sheet-esc" aria-hidden="true">esc</span>
                  <button class="sheet-close" id="code-close" type="button" aria-label="Close"></button>
                </div>
                <div class="code-body">
                  <h2 class="code-title" id="code-title">Use it in your code or agent</h2>
                  <p class="code-lead" id="code-lead">The same page, format and options, through hosted Octocrawl (<code>api.octocrawl.dev</code> and <code>mcp.octocrawl.dev</code>: no key within a daily allowance, a key for more and the browser lane) or on your own computer with no limit (<code>npx octocrawl serve</code>, <code>npx -y @octocrawl/mcp</code>). A browser-lane run may differ from this HTTP preview.</p>
                  <div class="code-bar">
                    <div class="code-tabs" role="tablist" aria-label="How to run it">
                      <button class="code-tab" id="code-tab-curl" type="button" role="tab" aria-controls="code-panel" aria-selected="true" data-tab="curl"><span class="row-mark" aria-hidden="true"></span>cURL</button>
                      <button class="code-tab" id="code-tab-mcp" type="button" role="tab" aria-controls="code-panel" aria-selected="false" tabindex="-1" data-tab="mcp"><span class="row-mark" aria-hidden="true"></span>MCP call</button>
                      <button class="code-tab" id="code-tab-prompt" type="button" role="tab" aria-controls="code-panel" aria-selected="false" tabindex="-1" data-tab="prompt"><span class="row-mark" aria-hidden="true"></span>Prompt</button>
                    </div>
                    <button class="code-copy" id="code-copy" type="button">Copy</button>
                  </div>
                  <p class="code-step" id="code-step"></p>
                  <div class="code-panel" id="code-panel" role="tabpanel" tabindex="0" aria-labelledby="code-tab-curl"><ol class="code-lines" id="code-lines"></ol></div>
                  <p class="code-links"><a href="/docs/reference/">Advanced reference ↗</a><a href="/docs/connect-mcp/">Connect MCP ↗</a></p>
                  <p class="visually-hidden" id="code-status" role="status" aria-live="polite"></p>
                </div>
              </dialog>
            </form>
          </div>
        </div>
        <a class="hero-scroll" id="hero-scroll" href="${copy.next}"><span class="hero-scroll-glyph" aria-hidden="true"></span><span id="hero-scroll-label">${copy.nextLabel}</span></a>
      </main>
    </div>

${copy.tool ? '' : `    <div class="glyph-band" aria-hidden="true"><pre>${glyphBand()}</pre></div>
`}
    <section class="runs-section" id="result-section" aria-labelledby="runs-title" hidden>
      <div class="band">
        <div class="frame runs-head">
          <div><p class="section-kicker"><span class="kicker-square"></span> YOUR RESULTS</p><h2 id="runs-title">Recent runs</h2></div>
          <div class="runs-aside">
            <p class="runs-note">This visit only · cleared when you leave the page</p>
            <p class="runs-next">Use it in your agent: <a href="/docs/connect-mcp/">Connect MCP</a> · <a href="https://github.com/77777R7/Octocrawl">Run it yourself <span aria-hidden="true">↗</span></a></p>
          </div>
        </div>
      </div>
      <div class="band"><div class="frame runs-grid" id="runs-grid"></div></div>
      <div class="band">
        <div class="frame run-detail" id="run-detail">
          <div class="detail-head">
            <p class="section-kicker"><span class="kicker-square"></span> SELECTED RUN</p>
            <h2 id="result-heading" tabindex="-1">Reading the page…</h2>
            <p class="detail-url" id="detail-url"></p>
          </div>
          <div id="result-content" aria-live="polite" aria-atomic="false"></div>
        </div>
      </div>
    </section>

`
}
