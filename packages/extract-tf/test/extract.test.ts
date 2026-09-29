import { describe, expect, it } from 'vitest'
import { extractTf } from '../src/index.js'

const ARTICLE = `<!doctype html><html><head><title>Kiln temperatures and glaze vitrification</title></head>
<body>
<div id="cookie-consent" role="dialog"><p>We use cookies to personalise content.</p><button>Accept all</button></div>
<nav class="site-nav"><a href="/">Home</a> <a href="/pricing">Pricing</a></nav>
<article>
<h1>Kiln temperatures and glaze vitrification</h1>
<p>The kiln reached 1240 degrees before the glaze vitrified. Every reading was logged in the ledger kept by the harbour office.</p>
<p>Sediment cores from the estuary date to 1873. Researchers compared them against the almanac kept at the plinth house.</p>
<p>Later experiments repeated the same steps, and the temperature curve matched the first recording within fifteen degrees.</p>
</article>
<aside class="sidebar"><h3>Trending</h3><ul><li><a href="/a">Unrelated link A</a></li></ul></aside>
<footer><p>Copyright 2026 Synthetic Fixture Co. All rights reserved.</p></footer>
</body></html>`

describe('extractTf', () => {
  it('extracts the article, its title, and none of the boilerplate', () => {
    const out = extractTf.extract(ARTICLE)
    expect(out.title).toBe('Kiln temperatures and glaze vitrification')
    expect(out.mainHtml).toContain('The kiln reached 1240 degrees')
    expect(out.mainHtml).toContain('Sediment cores from the estuary date to 1873.')
    expect(out.mainHtml).not.toContain('We use cookies')
    expect(out.mainHtml).not.toContain('Pricing')
    expect(out.mainHtml).not.toContain('Copyright 2026')
    expect(out.mainHtml).not.toContain('Trending')
    expect(out.escalate).toBe(false)
    expect(out.confidence).toBeGreaterThan(0.5)
  })

  it('handles CJK prose without requiring sentence-final punctuation', () => {
    const html = `<!doctype html><html><body><article>
<h1>窑温与釉面玻化</h1>
<p>窑温达到一千二百四十度后釉面开始玻化。研究者用罗盘和测温计记录了每一次开窑的读数，并把结果抄录在年鉴里。</p>
<p>后续的实验重复了同样的步骤，温度曲线与第一次记录基本一致，误差不超过十五度。</p>
</article></body></html>`
    const out = extractTf.extract(html)
    expect(out.title).toBe('窑温与釉面玻化')
    expect(out.mainHtml).toContain('窑温达到一千二百四十度')
    expect(out.escalate).toBe(false)
  })

  it('survives malformed markup and still finds the fact', () => {
    const html = `<!doctype html><html><head><title>Broken</title></head><body>
<div class=unquoted><p>The valve seized in the second winter.
<p>Another paragraph with <b>unclosed bold
<ul><li>one<li>two
<p>Trailing text after a stray </div></span>
</body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('The valve seized in the second winter.')
  })

  it('prunes cookie banners by id even when they precede content', () => {
    const html = `<!doctype html><html><body>
<div id="onetrust-banner-sdk"><p>Manage your privacy settings</p></div>
<article><h1>Report</h1><p>The survey covers forty villages and three hundred households in the upper valley.</p></article>
</body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('The survey covers forty villages')
    expect(out.mainHtml).not.toContain('Manage your privacy')
  })

  it('escalates on a page with no prose at all', () => {
    const out = extractTf.extract('<!doctype html><html><body><div id="root"></div></body></html>')
    expect(out.escalate).toBe(true)
    expect(out.mainHtml).toBe('')
  })

  it('keeps a release held in one long <pre> inside nested wrappers', () => {
    const release = Array.from({ length: 12 }, (_, i) =>
      `Line ${i + 1}: Total nonfarm payroll employment increased by 162,000 in August, and the rate held at 4.1 percent.`).join('\n')
    const html = `<!doctype html><html><head><title>Employment Situation Summary</title></head><body>
<div class="helpFormSection"><p>Are you a survey respondent and need help submitting your data?</p></div>
<div class="helpFormSection"><p>Do you have questions about the monthly estimates?</p></div>
<div id="wrapper"><div id="main-content"><div id="bodytext"><div class="normalnews"><figure><pre>${release}</pre></figure></div></div></div></div>
</body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('Line 12: Total nonfarm payroll employment')
    expect(out.mainHtml).not.toContain('survey respondent')
  })

  it('keeps a data table that a table viewer wraps in its form', () => {
    const rows = ['Canada', 'Ontario', 'Quebec', 'British Columbia'].map((geo, i) =>
      `<tr><th>${geo}</th><td>${(41_000_000 - i * 9_000_000).toLocaleString('en-US')}</td></tr>`).join('')
    const html = `<!doctype html><html><body><main>
<h1>Population estimates, quarterly</h1>
<form id="viewForm"><label for="ref">Reference period</label><select id="ref"><option>2026</option></select><button>Apply</button>
<div id="viewHtml"><table><thead><tr><th>Geography</th><th>July 1, 2026</th></tr></thead><tbody>${rows}</tbody></table></div>
</form></main></body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('British Columbia')
    expect(out.mainHtml).toContain('14,000,000')
    expect(out.mainHtml).not.toContain('Apply')
  })

  it('still drops a short comment form', () => {
    const html = `<!doctype html><html><body><article>
<h1>Kiln temperatures</h1>
<p>The kiln reached 1240 degrees before the glaze vitrified. Every reading was logged in the ledger kept by the harbour office.</p>
<form class="comment-form"><p>Leave a reply. Your email address will not be published.</p><textarea></textarea><button>Post comment</button></form>
</article></body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('The kiln reached 1240 degrees')
    expect(out.mainHtml).not.toContain('Leave a reply')
  })

  it('counts tables whose rows a script has yet to fill', () => {
    const html = `<!doctype html><html><body><main><h1>Population estimates, quarterly</h1>
<p>Table 17-10-0009-01. Release date 2026-09-23. Frequency: quarterly. Geography: Canada, province or territory.</p>
<table id="simpleTable"><thead id="simpleTableHeader"></thead><tbody id="simpleTableBody"></tbody></table>
</main></body></html>`
    expect(extractTf.extract(html).emptyTableShells).toBe(1)
    expect(extractTf.extract(ARTICLE).emptyTableShells).toBe(0)
  })

  it('filters link-farm paragraphs by link density', () => {
    const html = `<!doctype html><html><body><article>
<h1>Directory</h1>
<p><a href="/a">Alpha link one</a> <a href="/b">Beta link two</a> <a href="/c">Gamma link three</a></p>
<p>This paragraph carries real prose about the harbour and its many lighthouses that guide ships home.</p>
</article></body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('real prose about the harbour')
  })

  it('favorPrecision and favorRecall pick different containers', () => {
    // <article> holds several short blocks (below the precision threshold but
    // above the recall threshold); a div holds one long block. Under
    // favorPrecision the short blocks are filtered out and the div wins;
    // under favorRecall the article's semantic bonus dominates.
    const html = `<!doctype html><html><body>
<article><h1>Fragments</h1>
<p>Short observation number one here.</p>
<p>Short observation number two here.</p>
<p>Short observation number three here.</p>
</article>
<div><p>This is a properly long paragraph with real prose content that should dominate precision filtering without any trouble at all.</p></div>
</body></html>`
    const precise = extractTf.extract(html, { favorPrecision: true })
    const recalled = extractTf.extract(html, { favorRecall: true })
    expect(precise.mainHtml).toContain('dominate precision filtering')
    expect(recalled.mainHtml).toContain('Short observation number one')
  })

  it('leaves out what a browser capture marked hidden', () => {
    const menu = 'The collapsed mobile menu repeats every section title of the site in long sentences that no reader of the desktop page sees.'
    const html = `<!doctype html><html><body>
<div class="menu" data-w2l-hidden=""><p>${menu}</p><p>${menu}</p><p>${menu}</p></div>
<div class="report"><p>The survey covers forty villages and three hundred households in the upper valley.</p></div>
</body></html>`
    const out = extractTf.extract(html)
    expect(out.mainHtml).toContain('The survey covers forty villages')
    expect(out.mainHtml).not.toContain('collapsed mobile menu')
    // Unmarked HTML (every lane but the browser's) still chooses by text alone.
    expect(extractTf.extract(html.replace(' data-w2l-hidden=""', '')).mainHtml).toContain('collapsed mobile menu')
  })

  it('applies caller prune selectors', () => {
    const html = `<!doctype html><html><body><article>
<h1>Report</h1>
<p class="sponsor-note">Brought to you by our generous sponsor.</p>
<p>The harbour master recorded the tides every hour without exception through the winter months.</p>
</article></body></html>`
    const out = extractTf.extract(html, { pruneSelectors: ['.sponsor-note'] })
    expect(out.mainHtml).not.toContain('generous sponsor')
    expect(out.mainHtml).toContain('harbour master recorded the tides')
  })
})
