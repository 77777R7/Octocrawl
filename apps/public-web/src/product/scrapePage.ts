import { footerMarkup, siteHeaderMarkup } from '../page'
import { glyphCloud } from '../glyphArt'
import { FIELDS, HARD, LINKS, MARKDOWN, MISSING, PAGE, RUN, TABLE, WHOLE_EXTRA } from './scrapeRun'

/** /scrape/: what scraping a page with Octocrawl gives, shown on one real scrape (scrapeRun.ts). The hero plays that
 * scrape on a drawing of the page (scrapeStage.ts), and How it works walks the same page through each step as the
 * reader scrolls (scrapePipeline.ts). vite.config.ts prerenders this markup into scrape/index.html. */

export const SCRAPE_PATH = '/scrape/'
export const SCRAPE_TITLE = 'Web Scraping API: Markdown and Checked Fields | Octocrawl'
export const SCRAPE_DESCRIPTION = 'Turn any web page into Markdown, links, tables and source-checked fields, with an Evidence Record for every result. A page that is blocked or refused comes back with the reason, and costs nothing.'

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const short = (hash: string): string => `${hash.slice(0, 8)}…${hash.slice(-8)}`

/** One Markdown line, coloured by what it is. */
function markdownLine(text: string): string {
  if (!text) return ''
  if (text.startsWith('![')) {
    const alt = text.slice(2, text.indexOf(']'))
    return `<span class="md-punct">![</span><span class="md-alt">${esc(alt)}</span><span class="md-punct">](</span><span class="md-url">${esc(text.slice(text.indexOf('(') + 1, -1))}</span><span class="md-punct">)</span>`
  }
  if (text.startsWith('#')) {
    const marks = text.slice(0, text.indexOf(' '))
    return `<span class="md-punct">${marks}</span> <span class="md-heading">${esc(text.slice(marks.length + 1))}</span>`
  }
  if (text === '---' || text === '| --- | --- |') return `<span class="md-punct">${esc(text)}</span>`
  if (text.startsWith('|')) {
    const [, label, value] = text.split('|').map((cell) => cell.trim())
    return `<span class="md-punct">|</span> <span class="md-cell">${esc(label!)}</span> <span class="md-punct">|</span> <span class="md-value">${esc(value!)}</span> <span class="md-punct">|</span>`
  }
  if (text.startsWith('**')) {
    const end = text.indexOf('**', 2)
    return `<span class="md-punct">**</span><span class="md-strong">${esc(text.slice(2, end))}</span><span class="md-punct">**</span>${esc(text.slice(end + 2))}`
  }
  return esc(text)
}

/** A line of the code panes, tied to the block of the page it came from. */
const line = (n: number, html: string, src = '', extra = ''): string =>
  `<li class="pd-line${src ? ' has-src' : ''}"${src ? ` data-src="${src}"` : ''}${extra}><span class="pd-ln" aria-hidden="true">${n}</span><code>${html || '&nbsp;'}</code></li>`

/** The page as it was served, drawn in its own layout: what the scrape reads. */
function sourcePage(): string {
  const crumbs = PAGE.crumbs.map((crumb, i) => `<a data-src="crumb-${i}" tabindex="-1">${crumb}</a><span class="pd-sep" aria-hidden="true">/</span>`).join('')
  const rows = TABLE.map(([label, value], i) => `<tr data-src="row-${i}"><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('')
  return `
            <figure class="pd-window" aria-label="The page as books.toscrape.com served it">
              <div class="pd-chrome" aria-hidden="true"><span class="pd-dots"><i></i><i></i><i></i></span><span class="pd-address"><span class="pd-scheme">https://</span><span class="pd-host">${RUN.host}</span><span class="pd-path">${esc(RUN.path)}</span></span></div>
              <div class="pd-page" id="pd-page">
                <div class="pd-b pd-site" data-src="header" data-drop><span class="pd-site-name">${PAGE.site}</span><span class="pd-site-tag">${PAGE.tagline}</span></div>
                <nav class="pd-b pd-crumbs" data-src="crumbs" aria-label="Breadcrumb on the page">${crumbs}<span>${PAGE.crumb}</span></nav>
                <div class="pd-product">
                  <div class="pd-b pd-cover" data-src="cover" aria-label="Cover image"><span class="pd-cover-title">A Light<br />in the Attic</span><span class="pd-cover-by">Shel Silverstein</span></div>
                  <div class="pd-product-info">
                    <p class="pd-b pd-title" data-src="title">${PAGE.title}</p>
                    <p class="pd-b pd-price" data-src="price">${PAGE.price}</p>
                    <p class="pd-b pd-stock" data-src="stock"><span aria-hidden="true">✓</span> ${PAGE.stock}</p>
                    <p class="pd-b pd-stars" data-src="stars" data-drop aria-label="Rated three stars">★★★<span>★★</span></p>
                    <p class="pd-b pd-note" data-src="note"><strong>${PAGE.note[0]}</strong> ${PAGE.note[1]}</p>
                  </div>
                </div>
                <p class="pd-b pd-heading" data-src="desc-h">Product Description</p>
                <p class="pd-b pd-text" data-src="desc">${PAGE.description} …</p>
                <p class="pd-b pd-heading" data-src="info-h">Product Information</p>
                <table class="pd-b pd-table" data-src="table"><tbody>${rows}</tbody></table>
                <div class="pd-b pd-foot" data-src="footer" data-drop></div>
              </div>
            </figure>`
}

/** What the scrape returned, one tab per format. */
function console_(): string {
  const markdown = MARKDOWN.map((m, i) => line(i + 1, markdownLine(m.text), m.src, m.cut ? ' data-cut' : '')).join('')
  const links = LINKS.map((link, i) => line(i + 1, `<span class="md-url">${esc(link.href)}</span><span class="pd-from">${PAGE.crumbs[i]}</span>`, link.src)).join('')
  const table = TABLE.map(([label, value], i) => `<tr class="has-src" data-src="row-${i}"><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('')
  const fields = [
    line(1, '<span class="js-punct">{</span>'),
    ...FIELDS.map((f, i) => line(i + 2, `  <span class="js-key">"${f.name}"</span><span class="js-punct">:</span> <span class="${f.json.startsWith('"') ? 'js-str' : 'js-num'}">${esc(f.json)}</span>${i < FIELDS.length - 1 ? '<span class="js-punct">,</span>' : ''}<span class="pd-check" aria-label="read from the page">✓</span><span class="pd-locator">${esc(f.locator)}</span>`, f.src)),
    line(FIELDS.length + 2, '<span class="js-punct">}</span>'),
  ].join('')
  const record: Array<[string, string, string?]> = [
    ['<span class="js-punct">{</span>', ''],
    [`  <span class="js-key">"schemaVersion"</span>: <span class="js-str">"${RUN.schemaVersion}"</span>,`, ''],
    [`  <span class="js-key">"finalUrl"</span>: <span class="js-str">"https://${RUN.host}/catalogue/a-light-…"</span>,`, 'crumbs'],
    [`  <span class="js-key">"fetchedAt"</span>: <span class="js-str">"${RUN.fetchedAt}"</span>,`, ''],
    [`  <span class="js-key">"httpStatus"</span>: <span class="js-num">${RUN.httpStatus}</span>, <span class="js-key">"lane"</span>: <span class="js-str">"${RUN.lane}"</span>,`, ''],
    [`  <span class="js-key">"robotsDecision"</span>: { <span class="js-key">"decision"</span>: <span class="js-str">"${RUN.robots.decision}"</span> },`, ''],
    [`  <span class="js-key">"rawSha256"</span>: <span class="js-str">"${short(RUN.rawSha256)}"</span>,`, 'page'],
    [`  <span class="js-key">"outputSha256"</span>: { <span class="js-key">"markdown"</span>: <span class="js-str">"${short(RUN.outputSha256.markdown)}"</span> },`, 'kept'],
    [`  <span class="js-key">"extractor"</span>: { <span class="js-key">"version"</span>: <span class="js-str">"${RUN.extractor}"</span> },`, ''],
    ...FIELDS.map((f, i): [string, string] => [`  ${i ? '  ' : '<span class="js-key">"fieldEvidence"</span>: { '}<span class="js-key">"/${f.name}"</span>: { <span class="js-key">"source"</span>: <span class="js-str">"${f.source}"</span>, <span class="js-key">"locator"</span>: <span class="js-str">"${esc(f.locator)}"</span> }${i < FIELDS.length - 1 ? ',' : ' }'}`, f.src]),
    ['<span class="js-punct">}</span>', ''],
  ]
  const evidence = record.map(([html, src], i) => line(i + 1, html, src)).join('')
  const tab = (view: string, label: string, count = ''): string =>
    `<button class="pd-tab" type="button" role="tab" id="pd-tab-${view}" aria-controls="pd-pane-${view}" aria-selected="${view === 'markdown'}" tabindex="${view === 'markdown' ? 0 : -1}" data-view="${view}">${label}${count ? `<span class="pd-count">${count}</span>` : ''}</button>`
  const pane = (view: string, body: string, hidden = true): string =>
    `<div class="pd-pane" role="tabpanel" id="pd-pane-${view}" aria-labelledby="pd-tab-${view}" data-view="${view}"${hidden ? ' hidden' : ''}>${body}</div>`
  return `
            <div class="pd-console" aria-label="What Octocrawl returned">
              <div class="pd-tabs" role="tablist" aria-label="Formats">${tab('markdown', 'Markdown')}${tab('links', 'Links', String(LINKS.length))}${tab('table', 'Table', '1')}${tab('fields', 'Fields', String(FIELDS.length))}${tab('evidence', 'Evidence')}</div>
              <div class="pd-panes">
                ${pane('markdown', `<ol class="pd-code" role="list">${markdown}</ol>`, false)}
                ${pane('links', `<ol class="pd-code" role="list">${links}</ol><p class="pd-pane-note">Every link on the page, each once, as absolute URLs. On this page they are the site header’s and the breadcrumb’s.</p>`)}
                ${pane('table', `<table class="pd-grid"><tbody>${table}</tbody></table><p class="pd-pane-note">1 table · 7 rows × 2 columns · also as CSV</p>`)}
                ${pane('fields', `<ol class="pd-code" role="list">${fields}</ol><p class="pd-pane-note">Read from the page without a model. Each value names where it was read.</p>`)}
                ${pane('evidence', `<ol class="pd-code" role="list">${evidence}</ol><p class="pd-pane-note">An excerpt of the Evidence Record that came with this result.</p>`)}
              </div>
              <div class="pd-status"><span class="pd-status-dot" aria-hidden="true"></span><span>${RUN.status}</span><span class="pd-status-sep" aria-hidden="true">·</span><span>HTTP ${RUN.httpStatus}</span><span class="pd-status-sep" aria-hidden="true">·</span><span>${RUN.credits} credit</span><span class="pd-status-sha" title="SHA-256 of the page’s bytes">sha256 ${RUN.rawSha256.slice(0, 12)}</span></div>
            </div>`
}

/** The pipeline's steps: what Octocrawl did with this page, in order. */
export const STEPS: ReadonlyArray<{ id: string; rail: string; kicker: string; title: string; text: string }> = [
  { id: 'url', rail: 'link', kicker: 'Take the link', title: 'One public URL.', text: 'Octocrawl takes an http or https link. Hosted, it reads only public web addresses: a link into a private network is refused before anything is sent.' },
  { id: 'robots', rail: 'robots', kicker: 'Read robots.txt', title: 'The site’s rules come first.', text: `It asks for <code>/robots.txt</code> before the page. ${RUN.host} has none (404), which counts as no rules. Hosted Octocrawl never requests a page the rules disallow: it answers with the reason, and charges nothing.` },
  { id: 'fetch', rail: 'fetch', kicker: 'Fetch the page', title: 'HTTP first. A browser only when needed.', text: `The page came back over HTTP: 200, ${RUN.contentType}, ${RUN.bytes.toLocaleString('en-US')} bytes, 1 credit. Its content was in the HTML, so no browser was needed. A page drawn by JavaScript would go on to one, at 5 credits.` },
  { id: 'clean', rail: 'content', kicker: 'Keep the content', title: 'Menus and clutter fall away.', text: 'It finds what the page is about (here, a product) and keeps it. The site’s header, the rating stars and the footer are left out. Ask for the whole page to keep them.' },
  { id: 'shape', rail: 'formats', kicker: 'Shape the output', title: 'One read. Every format.', text: `From that one read: Markdown (${RUN.contentTokens} tokens), ${LINKS.length} links, 1 table of 7 rows, and the ${FIELDS.length} fields asked for, each with where on the page it was found.` },
  { id: 'seal', rail: 'record', kicker: 'Write the Evidence Record', title: 'Proof of where it came from.', text: 'Last, the record: the URL as fetched, the time, the robots.txt decision, the lane, and SHA-256 hashes of the page’s bytes and of its Markdown and JSON. Hash the page yourself and you get the same value.' },
]

/** The pipeline's stage: one drawing per step, shown as the reader reaches it. */
function pipelineStage(): string {
  const tick = (text: string): string => `<li><span class="pl-tick" aria-hidden="true">✓</span>${text}</li>`
  return `
          <div class="pl-stage" id="pl-stage" aria-hidden="true">
            <ol class="pl-rail">${STEPS.map((step) => `<li data-step="${step.id}"><i></i><span>${step.rail}</span></li>`).join('')}</ol>
            <div class="pl-card pl-url" data-step="url">
              <div class="pl-bar"><span class="pl-scheme">https://</span>${RUN.host}<span class="pl-dim">${esc(RUN.path)}</span></div>
              <ul class="pl-checks">${tick('https link')}${tick('public host')}</ul>
            </div>
            <div class="pl-card pl-robots" data-step="robots">
              <div class="pl-file"><span class="pl-verb">GET</span> /robots.txt</div>
              <div class="pl-answer"><span class="pl-code">404</span> Not Found</div>
              <div class="pl-stamp"><span>no rules</span><small>decision: ${RUN.robots.decision}</small></div>
            </div>
            <div class="pl-card pl-fetch" data-step="fetch">
              <div class="pl-lane is-taken"><span class="pl-lane-name">HTTP</span><span class="pl-track"><i class="pl-packet"></i></span><span class="pl-lane-out">200 · ${RUN.bytes.toLocaleString('en-US')} bytes · 1 credit</span><span class="pl-badge">${RUN.httpStatus}</span></div>
              <div class="pl-lane is-idle"><span class="pl-lane-name">Browser</span><span class="pl-track"></span><span class="pl-lane-out">not needed · 5 credits</span></div>
            </div>
            <div class="pl-card pl-clean" data-step="clean">
              <div class="pl-mini">
                <i class="pl-m pl-m-drop pl-m-site"></i><i class="pl-m pl-m-crumbs"></i>
                <span class="pl-m-row"><i class="pl-m pl-m-cover"></i><span class="pl-m-col"><i class="pl-m pl-m-title"></i><i class="pl-m pl-m-price"></i><i class="pl-m pl-m-line"></i><i class="pl-m pl-m-drop pl-m-stars"></i><i class="pl-m pl-m-note"></i></span></span>
                <i class="pl-m pl-m-h"></i><i class="pl-m pl-m-text"></i><i class="pl-m pl-m-h"></i><i class="pl-m pl-m-table"></i><i class="pl-m pl-m-drop pl-m-foot"></i>
              </div>
              <p class="pl-type">pageType <b>${RUN.pageType}</b></p>
            </div>
            <div class="pl-card pl-shape" data-step="shape">
              <div class="pl-out"><b>Markdown</b><span>${RUN.contentTokens} tokens</span></div>
              <div class="pl-out"><b>Links</b><span>${LINKS.length}</span></div>
              <div class="pl-out"><b>Table</b><span>7 × 2</span></div>
              <div class="pl-out"><b>Fields</b><span>${FIELDS.length} of ${FIELDS.length} read</span></div>
            </div>
            <div class="pl-card pl-seal" data-step="seal">
              <ol class="pl-receipt">
                <li><span>schemaVersion</span><b>${RUN.schemaVersion}</b></li>
                <li><span>fetchedAt</span><b>${RUN.fetchedAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}</b></li>
                <li><span>robots</span><b>${RUN.robots.decision}</b></li>
                <li><span>lane</span><b>${RUN.lane}</b></li>
                <li><span>rawSha256</span><b>${short(RUN.rawSha256)}</b></li>
                <li><span>markdown</span><b>${short(RUN.outputSha256.markdown)}</b></li>
                <li><span>fields</span><b>${FIELDS.length} with locators</b></li>
              </ol>
              <div class="pl-sealmark"><span>sealed</span></div>
            </div>
          </div>`
}

/** Questions people ask about scraping a page, answered for Octocrawl. */
export const SCRAPE_FAQ: ReadonlyArray<readonly [question: string, answer: string]> = [
  ['What is the difference between scrape, map and crawl?', 'Scrape reads one page and gives you what it holds. Map lists a site’s URLs from its sitemaps and links without reading each page. Crawl follows links from a start page and scrapes each one; it runs on your own computer with <code>npx octocrawl serve</code>, as does batch, which reads up to 1,000 URLs you give it.'],
  ['Does it read pages that need JavaScript?', 'Yes. Octocrawl reads over HTTP first, and when that finds only an empty shell it reads the page in a browser. Hosted, a browser read costs 5 credits and needs an account’s key; without a key, hosted Octocrawl reads over HTTP only. On your own computer it uses a browser with no limit.'],
  ['Does it respect robots.txt?', 'Hosted Octocrawl reads the site’s robots.txt first and never requests a page it disallows; the answer says so and costs nothing. On your own computer, a URL you give it yourself is read and the robots.txt decision is recorded in its Evidence Record; crawl and map follow the rules.'],
  ['Which formats can I ask for?', 'Markdown, links, HTML, raw HTML, images, tables (also as CSV), a screenshot (read in a browser) and JSON fields from a schema, any of them from one read. The page’s metadata comes with every result.'],
  ['How are fields read without a model?', 'From what the page states: JSON-LD, microdata, meta tags, table rows, definition lists and a PDF’s “Label: value” lines. Each value names where it was read. A field the page doesn’t state comes back null with the reason. A model fallback exists, but it is off unless you turn it on.'],
  ['Can it read PDFs?', 'Yes: the text layer of a PDF, page by page, with page markers. It does no OCR, so a scanned page without text comes back empty rather than guessed. CSV, JSON and plain text come back as they were served.'],
  ['What does a blocked page cost?', 'Nothing. A page blocked by a check, a challenge or robots.txt, and a call that read nothing, cost 0 credits. A page that doesn’t exist (404 or 410) is still the site’s answer and costs 1 credit, like a page read over HTTP; one read in a browser costs 5.'],
  ['What is in the Evidence Record?', 'The URL asked for and the one fetched, the redirects, when it was fetched, the HTTP status, the robots.txt decision, the lane, SHA-256 hashes of the bytes read and of the Markdown and JSON delivered, the extractor’s version and where each field was found. See the <a href="/docs/reference/#evidence-record">reference</a>.'],
]

/** The page's structured data: the questions above. */
export function scrapeJsonLd(): string {
  const text = (html: string): string => html.replace(/<[^>]+>/g, '')
  const data = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: SCRAPE_FAQ.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: text(answer) } })) }
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

const mdHtml = (lines: readonly string[]): string => lines.map((text) => `<li class="ft-line"><code>${markdownLine(text) || '&nbsp;'}</code></li>`).join('')

/** What it does: four cards, each with something to try. */
function features(): string {
  const main = MARKDOWN.slice(0, 9).map((m) => m.text)
  const formats = ['markdown', 'links', 'html', 'rawHtml', 'images', 'tables', 'screenshot', 'json']
  const fieldChips = MISSING.map((f, i) => `<button class="ft-chip" type="button" aria-pressed="${i < 2}" data-field="${f.name}">${f.name}</button>`).join('')
  const fieldLines = MISSING.map((f) => `<li class="ft-line ft-field${f.value === null ? ' is-null' : ''}" data-field="${f.name}"${MISSING.indexOf(f) < 2 ? '' : ' hidden'}><code>  <span class="js-key">"${f.name}"</span>: ${f.value === null ? '<span class="js-null">null</span>' : `<span class="js-str">${esc(f.value)}</span>`}</code>${f.value === null ? `<span class="ft-issue">${esc(f.issue!)}</span>` : `<span class="ft-where">✓ ${esc(f.locator!)}</span>`}</li>`).join('')
  const hardTabs = HARD.map((h, i) => `<button class="ft-tab" type="button" role="tab" id="ft-tab-${h.id}" aria-controls="ft-hard-${h.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-hard="${h.id}">${h.tab}</button>`).join('')
  const hardPanes = HARD.map((h, i) => `
                <div class="ft-hard" role="tabpanel" id="ft-hard-${h.id}" aria-labelledby="ft-tab-${h.id}" data-hard="${h.id}"${i ? ' hidden' : ''}>
                  <p class="ft-url"><span class="ft-dot is-${h.status}" aria-hidden="true"></span>${esc(h.url)}</p>
                  <dl class="ft-facts">${h.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
                  ${h.lines.length ? `<ol class="ft-md" role="list">${mdHtml(h.lines)}</ol>` : `<div class="ft-refused"><span>never requested</span><small>status failed · policy_denied · 0 credits</small></div>`}
                </div>`).join('')
  return `
    <section class="ft-section" id="what-it-does" aria-labelledby="ft-title">
      <div class="band">
        <div class="frame ft-head">
          <p class="section-kicker"><span class="kicker-square"></span> WHAT IT DOES</p>
          <h2 id="ft-title">Everything the page says.<br /><em>Nothing it doesn’t.</em></h2>
        </div>
        <div class="frame ft-grid">
          <article class="ft-card ft-clean" aria-labelledby="ft-clean-title">
            <h3 id="ft-clean-title">Clean Markdown, any format</h3>
            <p>The main content by default: the article, not the menus. Ask for the whole page when you want it, in any of eight formats from one read.</p>
            <div class="ft-window">
              <div class="ft-switch" role="radiogroup" aria-label="What to keep"><button type="button" role="radio" aria-checked="true" data-scope="main">Main content</button><button type="button" role="radio" aria-checked="false" data-scope="whole">Whole page</button></div>
              <ol class="ft-md" role="list" aria-live="polite">${WHOLE_EXTRA.map((text) => `<li class="ft-line is-extra${text ? '' : ' is-blank'}" hidden><code>${markdownLine(text) || '&nbsp;'}</code></li>`).join('')}${mdHtml(main)}<li class="ft-line ft-more"><code>…</code></li></ol>
              <p class="ft-meter"><span data-tokens>${RUN.contentTokens}</span> tokens of Markdown</p>
            </div>
            <ul class="ft-formats" role="list" aria-label="Formats">${formats.map((f) => `<li>${f}</li>`).join('')}</ul>
          </article>

          <article class="ft-card ft-hardcard" aria-labelledby="ft-hard-title">
            <h3 id="ft-hard-title">Reads the hard ones, or tells you why</h3>
            <p>Pages drawn by JavaScript go on to a browser. PDFs come back as text. A page it may not read is never fetched, and the answer says why. Three real runs:</p>
            <div class="ft-window">
              <div class="ft-tabs" role="tablist" aria-label="Three harder pages">${hardTabs}</div>${hardPanes}
            </div>
          </article>

          <article class="ft-card ft-evidence" aria-labelledby="ft-evidence-title">
            <h3 id="ft-evidence-title">An Evidence Record for every result</h3>
            <p>Every result says where it came from: the URL as fetched, when, the robots.txt decision, the lane, and SHA-256 hashes of what was read and of the Markdown and JSON delivered. Change one character of the page and see.</p>
            <div class="ft-window ft-tamper" id="ft-tamper">
              <pre class="ft-source" aria-label="The page’s HTML around its price"><span class="ft-src-dim">&lt;h1&gt;A Light in the Attic&lt;/h1&gt;</span>
<span>&lt;p class="price_color"&gt;</span><input class="ft-price" id="ft-price" type="text" value="${PAGE.price}" aria-label="The price in the page’s HTML" spellcheck="false" autocomplete="off" /><span>&lt;/p&gt;</span>
<span class="ft-src-dim">&lt;p class="instock availability"&gt;…</span></pre>
              <dl class="ft-hashes">
                <div><dt>SHA-256 of the page’s ${RUN.bytes.toLocaleString('en-US')} bytes, here in your browser</dt><dd class="ft-hash" id="ft-hash" aria-live="polite">${RUN.rawSha256}</dd></div>
                <div><dt>rawSha256 in the Evidence Record</dt><dd class="ft-hash is-record">${RUN.rawSha256}</dd></div>
              </dl>
              <p class="ft-verdict is-match" id="ft-verdict"><span aria-hidden="true">✓</span> <span>Matches: this is the page that was read.</span></p>
              <button class="ft-reset" type="button" id="ft-reset" hidden>Put the price back</button>
            </div>
          </article>

          <article class="ft-card ft-fields" aria-labelledby="ft-fields-title">
            <h3 id="ft-fields-title">Checked fields, never guessed</h3>
            <p>Ask for fields by name. Each value says where on the page it was read; a field the page doesn’t state comes back null, with the reason. Add one it doesn’t have:</p>
            <div class="ft-window">
              <div class="ft-chips" aria-label="Fields to ask for">${fieldChips}</div>
              <ol class="ft-md ft-json" role="list" aria-live="polite"><li class="ft-line"><code><span class="js-punct">{</span></code></li>${fieldLines}<li class="ft-line"><code><span class="js-punct">}</span></code></li></ol>
            </div>
          </article>
        </div>
      </div>
    </section>`
}

/** From your code: the same scrape, following the choices made above. scrapeCode.ts fills it in. */
function callIt(): string {
  const tabs = [['curl', 'cURL'], ['mcp', 'MCP'], ['cli', 'CLI'], ['ts', 'TypeScript'], ['py', 'Python']]
  return `
    <section class="cd-section" id="call-it" aria-labelledby="cd-title">
      <div class="band">
        <div class="frame cd-grid">
          <div class="cd-intro">
            <p class="section-kicker"><span class="kicker-square"></span> FROM YOUR CODE</p>
            <h2 id="cd-title">The same scrape,<br />one call <em>away.</em></h2>
            <p class="section-lead">Hosted at <code>api.octocrawl.dev</code> and <code>mcp.octocrawl.dev</code>, or on your own computer with <code>npx octocrawl serve</code>. The code follows what you chose above.</p>
            <p class="cd-follow" id="cd-follow" aria-live="polite"></p>
          </div>
          <div class="cd-window">
            <div class="cd-tabs" role="tablist" aria-label="Ways to call it">${tabs.map(([id, label], i) => `<button class="cd-tab" type="button" role="tab" id="cd-tab-${id}" aria-controls="cd-code" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-lang="${id}">${label}</button>`).join('')}<button class="cd-copy" type="button" id="cd-copy">Copy</button></div>
            <pre class="cd-code" id="cd-code" role="tabpanel" aria-labelledby="cd-tab-curl" tabindex="0"><code></code></pre>
            <p class="cd-note" id="cd-note"></p>
          </div>
        </div>
      </div>
    </section>`
}

/** What it costs, with a calculator. scrapeCost.ts runs it. */
function cost(): string {
  const rows: Array<[string, string]> = [['A page read over HTTP', '1'], ['A page read in a browser', '5'], ['A page that doesn’t exist (404, 410)', '1'], ['Blocked, refused, or nothing read', '0']]
  return `
    <section class="cs-section" id="cost" aria-labelledby="cs-title">
      <div class="band">
        <div class="frame cs-grid">
          <div class="cs-intro">
            <p class="section-kicker"><span class="kicker-square"></span> WHAT IT COSTS</p>
            <h2 id="cs-title">Pay for pages read.<br /><em>Never for a block.</em></h2>
            <table class="cs-table"><thead><tr><th>Result</th><th>Credits</th></tr></thead><tbody>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table>
            <p class="cs-small">Without a key: 20 pages a day per address, over HTTP. A free account: 1,000 credits a month and API keys. On your own computer: no limit. <a href="/#free-tiers">Free tiers</a> · <a href="/docs/limits/">Limits</a></p>
          </div>
          <form class="cs-calc" id="cs-calc" aria-labelledby="cs-calc-title">
            <p class="cs-calc-title" id="cs-calc-title">Your month</p>
            <label class="cs-field"><span>Pages a month <output id="cs-pages-out" for="cs-pages">1,000</output></span><input type="range" id="cs-pages" min="0" max="100" step="1" value="43" /></label>
            <label class="cs-field"><span>Pages that need a browser <output id="cs-browser-out" for="cs-browser">10%</output></span><input type="range" id="cs-browser" min="0" max="100" step="5" value="10" /></label>
            <p class="cs-total"><output id="cs-total">1,400</output> <span>credits a month</span></p>
            <progress class="cs-bar" id="cs-bar" max="1000" value="1000">1,400 of 1,000</progress>
            <p class="cs-verdict" id="cs-verdict" aria-live="polite"></p>
          </form>
        </div>
      </div>
    </section>`
}

/** Try a page of your own: the free tool page runs it. */
function tryIt(): string {
  return `
    <section class="tr-section" id="try" aria-labelledby="tr-title">
      <div class="band">
        <div class="frame tr-window">
          <h2 id="tr-title">Now scrape a page <em>of your own.</em></h2>
          <form class="tr-form" id="tr-form" action="/tools/url-to-markdown/" method="get">
            <label class="visually-hidden" for="tr-url">A public page’s URL</label>
            <input class="tr-input" id="tr-url" name="url" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://…" required />
            <button class="pd-button is-primary" type="submit">Scrape it <span aria-hidden="true">→</span></button>
          </form>
          <p class="tr-note">It runs on the free tool page: five pages a day, no sign-up.</p>
        </div>
      </div>
    </section>`
}

function faq(): string {
  return `
    <section class="faq-section" id="faq" aria-labelledby="faq-title">
      <div class="band">
        <div class="frame faq-grid">
          <div class="faq-intro">
            <pre class="glyph-cloud is-side" data-cols="70" data-rows="34" data-seed="7" aria-hidden="true">${glyphCloud(70, 34, 7)}</pre>
            <p class="section-kicker"><span class="kicker-square"></span> FAQ</p>
            <h2 id="faq-title">Scraping,<br />answered <em>plainly.</em></h2>
          </div>
          <div class="faq-list">${SCRAPE_FAQ.map(([question, answer]) => `<details class="faq-item"><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div>
        </div>
      </div>
    </section>`
}

export function scrapePageMarkup(): string {
  const steps = STEPS.map((step, i) => `
            <li class="pl-step" data-step="${step.id}">
              <p class="pl-step-kicker"><span class="pl-step-n">${String(i + 1).padStart(2, '0')}</span>${step.kicker}</p>
              <h3>${step.title}</h3>
              <p>${step.text}</p>
            </li>`).join('')
  return `
  <div class="page-shell product-page">
    <div class="pd-hero" id="top">
      <canvas class="pd-hero-field" aria-hidden="true"></canvas>
${siteHeaderMarkup()}      <main aria-labelledby="pd-title">
        <div class="band">
          <div class="frame pd-intro">
            <p class="pd-kicker"><span class="kicker-square" aria-hidden="true"></span>Scrape<span class="pd-kicker-rule" aria-hidden="true"></span>Octocrawl web data API</p>
            <h1 id="pd-title">Any page, <em>scraped clean.</em></h1>
            <p class="pd-lead">Turn any web data into Markdown, links, tables and source-checked fields, with an Evidence Record for every&nbsp;result.</p>
            <div class="pd-actions">
              <a class="pd-button is-primary" href="/tools/url-to-markdown/">Try it free <span aria-hidden="true">→</span></a>
              <a class="pd-button" href="/docs/reference/#rest-and-sdk">Read the docs</a>
            </div>
          </div>
        </div>
        <div class="band">
          <div class="frame pd-stage" id="pd-stage" data-view="markdown">${sourcePage()}
            <div class="pd-flow" aria-hidden="true"><span class="pd-flow-label">scrape</span></div>${console_()}
            <canvas class="pd-trail" aria-hidden="true"></canvas>
          </div>
          <p class="frame pd-caption"><span>A real scrape of a page on <a href="https://books.toscrape.com/">books.toscrape.com</a>, a sandbox made for practising scraping, recorded on 13 October 2026. Point at any line to see where it came from.</span><button class="pd-replay" type="button" id="pd-replay"><span aria-hidden="true">↻</span> Play again</button></p>
        </div>
      </main>
    </div>

    <section class="pl-section" id="how-it-works" aria-labelledby="pl-title">
      <div class="band">
        <div class="frame pl-head">
          <p class="section-kicker"><span class="kicker-square"></span> HOW IT WORKS</p>
          <h2 id="pl-title">From a link to data<br />you can <em>trust.</em></h2>
          <p class="section-lead">The same page, step by step, from the link to the record.</p>
        </div>
        <div class="frame pl-grid">
          <ol class="pl-steps" role="list">${steps}
          </ol>${pipelineStage()}
        </div>
      </div>
    </section>
${features()}
${callIt()}
${cost()}
${tryIt()}
${faq()}

${footerMarkup('/', false)}  </div>
`
}
