// The dashboard's pages (ROADMAP PH): their markup, which scripts/build-docs.mjs writes to dist and
// test/dashboard.test.ts renders with public/docs-assets/dashboard.js.
import MarkdownIt from 'markdown-it'

const escape = new MarkdownIt().utils.escapeHtml

// The dashboard: one sidebar, eight pages, all filled by dashboard.js from GET /api/account; the Playground's two run
// through POST /api/account/run. A dark page of its own, with
// no site header: the logo goes back to the site.
export const DASHBOARD_PAGES = [
  ['/dashboard/', 'Overview', 'Workspace'],
  ['/dashboard/activity/', 'Activity', 'Workspace'],
  ['/dashboard/usage/', 'Usage', 'Workspace'],
  ['/dashboard/scrape/', 'Scrape', 'Playground'],
  ['/dashboard/map/', 'Map', 'Playground'],
  ['/dashboard/keys/', 'API keys', 'Account'],
  ['/dashboard/connect/', 'Connect', 'Account'],
  ['/dashboard/settings/', 'Settings', 'Account'],
]
/** A solid bar (a <progress>): dashboard.js sets its value and max, which are properties the CSP allows. */
const creditBar = (id, label) => `<progress class="credit-bar" id="${id}" max="1" value="0" aria-label="${label}"></progress>`
/** The account menu under the avatar at the foot of the sidebar: it opens upward, printed in as the site's menus are. */
const ACCOUNT_MENU = [
  [['#', 'Settings', '/dashboard/settings/'], ['%', 'Usage', '/dashboard/usage/'], ['*', 'API keys', '/dashboard/keys/']],
  [['¶', 'Documentation', '/docs/'], ['±', 'Changelog', '/changelog/'], ['<>', 'GitHub', 'https://github.com/77777R7/Octocrawl']],
]
const accountMenu = `<div class="dash-me"><div class="dash-menu" id="me-menu" role="menu" aria-labelledby="me-button" hidden><p class="dash-menu-kicker">Account</p>${ACCOUNT_MENU.map(group => group.map(([glyph, name, href]) => `<a role="menuitem" href="${href}"${href.startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : ''}><span class="dash-menu-glyph" aria-hidden="true">${escape(glyph)}</span>${escape(name)}${href.startsWith('https://') ? '<span class="dash-menu-out" aria-hidden="true">↗</span>' : ''}</a>`).join('')).join('<hr />')}<hr /><form method="post" action="/auth/logout"><button role="menuitem" type="submit"><span class="dash-menu-glyph" aria-hidden="true">&lt;-</span>Sign out</button></form></div>
<button class="dash-me-button" type="button" id="me-button" aria-haspopup="menu" aria-expanded="false" aria-controls="me-menu"><span class="dash-avatar" id="me-initials" aria-hidden="true">··</span><span class="dash-me-email" id="side-email">…</span><span class="dash-caret" aria-hidden="true">▴</span></button></div>`
const dashCode = (id, text) => `<div class="code"><pre id="${id}">${escape(text)}</pre><button class="copy" type="button" data-copy="${id}">Copy</button></div>`
/** The request table the Activity page and the Overview share: dashboard.js fills its body from /api/account/activity. */
const requestTable = (id, rows, empty = 'No requests yet. Each call made with one of your keys or in the Playground shows here, with what it cost.') => `<div class="table-scroll"><table class="dash-table requests" data-rows="${rows}"><thead><tr><th class="time-head">Time (UTC)</th><th>Endpoint</th><th>URL</th><th>Format</th><th>Lane</th><th>Result</th><th>robots.txt</th><th class="num">Duration</th><th class="num">Credits</th><th>Evidence</th></tr></thead><tbody id="${id}-body"></tbody></table></div><p class="dash-small" id="${id}-empty" hidden>${empty}</p>`
export function dashboardPageHtml(path, title, lead, body, assetVersions) {
  // The Playground's pages keep their header to a line, as Firecrawl's does: the selector and the URL card come first.
  const playground = path === '/dashboard/scrape/' || path === '/dashboard/map/'
  let group = ''
  const links = DASHBOARD_PAGES.map(([href, name, section]) => {
    const heading = section === group ? '' : `<p class="dash-group">${escape(section)}</p>`
    group = section
    return `${heading}<a href="${href}"${href === path ? ' aria-current="page"' : ''}>${escape(name)}</a>`
  }).join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#04123a" /><meta name="robots" content="noindex" /><meta name="description" content="Your Octocrawl dashboard: credits, usage, API keys and how to connect." /><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" /><link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png" /><link rel="stylesheet" href="/docs-assets/dashboard.css?v=${assetVersions['dashboard.css']}" /><title>${escape(title)} | Octocrawl Dashboard</title></head>
<body><a class="skip-link" href="#main-content">Skip to content</a>
<div class="dash"><aside class="dash-side"><a class="dash-brand" href="/" aria-label="Octocrawl home"><img src="/assets/octopus-160.webp" width="30" height="30" alt="" /><img src="/assets/octocrawl-wordmark.svg" width="116" height="19" alt="" /></a>
<nav class="dash-nav" aria-label="Dashboard">${links}</nav>
<div class="dash-credits"><p><strong id="side-credits">…</strong> credits left</p>${creditBar('side-meter', 'Credits left of this month\'s grant')}<p class="dash-small" id="side-renews">&nbsp;</p></div>
${accountMenu}</aside>
<main id="main-content" class="dash-main"><header class="dash-head${playground ? ' compact' : ''}"><pre class="dash-noise" id="dash-noise" aria-hidden="true"></pre><p class="dash-kicker">Octocrawl / Dashboard</p><h1>${escape(title)}</h1>${playground ? '' : `<p class="dash-lead">${lead}</p>`}</header>
<p class="dash-message" id="dash-message" role="status" aria-live="polite"></p>
${body}</main></div><script defer src="/docs-assets/dashboard-charts.js?v=${assetVersions['dashboard-charts.js']}"></script>${playground ? `<script defer src="/docs-assets/dashboard-octopus.js?v=${assetVersions['dashboard-octopus.js']}"></script><script defer src="/docs-assets/playground-request.js?v=${assetVersions['playground-request.js']}"></script>` : ''}<script defer src="/docs-assets/dashboard.js?v=${assetVersions['dashboard.js']}"></script></body></html>`
}
// The Overview's banner: the Evidence Record, the thing that sets Octocrawl apart, centred between the octopus's arms,
// which dashboard.js draws in glyphs rising from both bottom corners and keeps swaying.
/** Clients the Overview links to, each to its setup on the Connect page. Icons are the docs' own; the rest are glyphs. */
const INTEGRATIONS = [
  ['Claude Code', 'claude', 'claude-code.svg'], ['Codex', 'codex', 'codex.svg'], ['Cursor', 'cursor', 'cursor.svg'], ['OpenCode', 'opencode', 'opencode.svg'],
  ['Cline', 'cline', 'CL'], ['Vercel AI SDK', 'sdk', '▲'], ['REST API', 'rest', '{ }'], ['On your computer', 'local', '>_'],
]
const integrationTiles = INTEGRATIONS.map(([name, id, icon]) => `<a class="int-tile" href="/dashboard/connect/#c-${id}"><span class="int-icon">${icon.endsWith('.svg') ? `<img src="/docs-assets/agent-clients/${icon}" width="22" height="22" alt="" />` : escape(icon)}</span><span class="int-name">${escape(name)}</span><span class="int-arrow" aria-hidden="true">↗</span></a>`).join('')
const overviewBody = `<section class="ev-hero" aria-labelledby="ev-title"><pre class="ev-field" id="ev-field" aria-hidden="true"></pre>
<div class="ev-copy"><p class="ev-badge">[ Evidence Record ]</p><h2 id="ev-title">Every page comes with its receipt.</h2><p>Each answer carries an Evidence Record: the address read, when, what robots.txt allowed and the SHA-256 of what came back.</p><div class="ev-actions"><a class="ev-btn primary" href="/dashboard/connect/">Connect your agent <span aria-hidden="true">→</span></a><a class="ev-btn" href="/docs/reference/#evidence-record">What a record holds</a></div></div></section>
<section class="kpis" aria-label="This month">
<div class="kpi"><p class="kpi-label">Credits left</p><p class="kpi-value" id="kpi-left">…</p>${creditBar('kpi-meter', 'Credits left of this month\'s grant')}</div>
<div class="kpi"><p class="kpi-label">Used this month</p><p class="kpi-value" id="kpi-used">…</p><p class="kpi-sub" id="kpi-used-sub">&nbsp;</p></div>
<div class="kpi"><p class="kpi-label">Pages read · 30 days</p><p class="kpi-value" id="kpi-pages">…</p><p class="kpi-sub" id="kpi-pages-sub">&nbsp;</p></div>
<div class="kpi"><p class="kpi-label">Not charged · 30 days</p><p class="kpi-value" id="kpi-free">…</p><p class="kpi-sub">blocked, robots.txt or no answer</p></div>
</section>
<div class="dash-grid pair">
<section class="panel" aria-labelledby="used-title"><div class="panel-head"><div><h2 id="used-title">Credits used</h2><p class="dash-small" id="used-range">Last 7 days (UTC)</p></div><div class="panel-tools"><span class="big-figure" id="used-total">…</span><div class="tabs" role="group" aria-label="Range"><button type="button" aria-pressed="true" data-range="7">7 days</button><button type="button" aria-pressed="false" data-range="30">30 days</button></div></div></div>
<div class="chart-wrap"><pre class="chart-ascii" id="used-ascii" aria-hidden="true"></pre><div id="used-chart"></div></div><a class="panel-link" href="/dashboard/usage/">Usage →</a></section>
<section class="panel" aria-labelledby="key-title"><div class="panel-head"><div><h2 id="key-title">API keys</h2><p class="dash-small" id="keys-mini-sub">&nbsp;</p></div><a class="button small" href="/dashboard/keys/">Create key</a></div>
<div class="panel-body"><div><ul class="key-list" id="keys-mini"></ul><p class="dash-small" id="keys-mini-empty" hidden>No keys yet. A key spends this account's credits and opens the browser lane.</p></div>
<div><h3>MCP server</h3>${dashCode('ov-mcp', 'https://mcp.octocrawl.dev/mcp')}</div><div><h3>On your computer, free</h3>${dashCode('ov-cli', 'npx octocrawl serve')}</div></div><a class="panel-link" href="/dashboard/connect/">Set up an agent →</a></section>
</div>
<section class="panel" aria-labelledby="int-title"><div class="panel-head"><h2 id="int-title">Integrations</h2><a href="/dashboard/connect/">All setups →</a></div><div class="integrations">${integrationTiles}</div></section>
<section class="panel" aria-labelledby="recent-title"><div class="panel-head"><h2 id="recent-title">Recent requests</h2><a href="/dashboard/activity/">Activity →</a></div>${requestTable('recent', 5)}</section>`
const activityBody = `<section class="panel" aria-labelledby="activity-title"><div class="panel-head"><h2 id="activity-title">Requests</h2><span class="dash-small" id="activity-count">&nbsp;</span></div>
<form class="filters" id="activity-filters"><label for="f-search">URL contains<input id="f-search" name="search" type="search" autocomplete="off" placeholder="example.com" /></label><label for="f-endpoint">Endpoint<select id="f-endpoint" name="endpoint"><option value="">All</option><option value="scrape">/scrape</option><option value="map">/map</option></select></label><label for="f-key">Key<select id="f-key" name="key"><option value="">All keys</option></select></label><label for="f-result">Result<select id="f-result" name="result"><option value="">All</option><option value="read">Read</option><option value="free">Not charged</option></select></label><button class="button quiet" type="button" id="export-csv">Export CSV</button></form>
${requestTable('activity', 0)}
<p class="dash-small">Lines are kept 30 days and only you see them: the URL asked for, what came back and what it cost, with the body's SHA-256 from the Evidence Record. Never the page's content. The page shows the latest 1,000. Runs in the Playground show under the key Playground.</p></section>`
const usageBody = `<section class="summary" aria-label="Summary">
<div class="summary-main"><p class="kpi-label">Credits remaining</p><p class="summary-figure" id="sum-left">…</p><p class="dash-small" id="sum-renews">&nbsp;</p>${creditBar('sum-meter', 'Credits left of this month\'s grant')}</div>
<div class="summary-cell"><p class="kpi-label">Credits used · 30 days</p><p class="kpi-value" id="sum-used">…</p></div>
<div class="summary-cell"><p class="kpi-label">Pages read · 30 days</p><p class="kpi-value" id="sum-pages">…</p></div>
<div class="summary-cell"><p class="kpi-label">Read · calls with a result</p><p class="kpi-value" id="sum-rate">—</p><p class="dash-small" id="sum-rate-sub">from request lines</p></div>
</section>
<section class="panel" aria-labelledby="over-time-title"><div class="panel-head"><div><h2 id="over-time-title">Usage over time</h2><p class="dash-small">Per UTC day, last 30 days</p></div><div class="panel-tools"><div class="tabs" role="group" aria-label="Group by"><button type="button" aria-pressed="true" data-group="kind">By kind</button><button type="button" aria-pressed="false" data-group="endpoint">By endpoint</button></div><div class="tabs" role="group" aria-label="Measure"><button type="button" aria-pressed="true" data-measure="credits">Credits</button><button type="button" aria-pressed="false" data-measure="calls">Calls</button></div></div></div>
<div id="usage-bars"></div><p class="chart-legend" id="usage-legend"></p></section>
<div class="dash-grid even">
<section class="panel tm-panel" aria-labelledby="by-site-title"><div class="panel-head"><h2 id="by-site-title">By site</h2><span class="dash-small lines-note">credits, from request lines</span></div><div class="tm-host" id="site-map"></div><p class="dash-small" id="by-site-empty" hidden>No request lines yet. Each call made with one of your keys adds to this.</p></section>
<section class="panel tm-panel" aria-labelledby="by-key-title"><div class="panel-head"><h2 id="by-key-title">By key</h2><span class="dash-small lines-note">credits, from request lines</span></div><div class="tm-host" id="key-map"></div><p class="dash-small" id="by-key-empty" hidden>No request lines yet.</p></section>
</div>
<div class="dash-grid even">
<section class="panel" aria-labelledby="results-title"><div class="panel-head"><h2 id="results-title">Results</h2><span class="dash-small lines-note">calls, from request lines</span></div><ul class="meters" id="results-list"></ul><p class="dash-small" id="results-empty" hidden>No request lines yet.</p></section>
<section class="panel" aria-labelledby="codes-title"><div class="panel-head"><h2 id="codes-title">HTTP status</h2><span class="dash-small lines-note">calls, from request lines</span></div><ul class="meters" id="codes-list"></ul><p class="dash-small" id="codes-empty" hidden>No request lines yet.</p></section>
</div>
<div class="dash-grid even">
<section class="panel" aria-labelledby="lanes-title"><div class="panel-head"><h2 id="lanes-title">HTTP or browser</h2><span class="dash-small lines-note">pages read, from request lines</span></div><ul class="meters" id="lanes-list"></ul><p class="dash-small" id="lanes-empty" hidden>No page read yet.</p><p class="dash-small">A page read over HTTP costs 1 credit; one that needs a browser costs 5.</p></section>
<section class="panel" aria-labelledby="hours-title"><div class="panel-head"><h2 id="hours-title">By hour (UTC)</h2><span class="dash-small lines-note">calls, from request lines</span></div><div id="hours-chart"></div><p class="dash-small" id="hours-empty" hidden>No request lines yet.</p></section>
</div>
<section class="panel" aria-labelledby="usage-table-title"><div class="panel-head"><h2 id="usage-table-title">Day by day</h2><span class="dash-small" id="usage-total">&nbsp;</span></div><div class="table-scroll"><table class="dash-table"><thead><tr><th>Day (UTC)</th><th class="num">HTTP</th><th class="num">Browser</th><th class="num">Not found</th><th class="num">Map</th><th class="num">Not charged</th><th class="num">Credits</th></tr></thead><tbody id="usage-body"></tbody><tfoot id="usage-foot"></tfoot></table></div><p class="dash-small" id="usage-empty" hidden>No calls in the last 30 days.</p>
<p class="dash-small">A page read over HTTP costs 1 credit, a page read in a browser 5, a page that does not exist 1, and a map 1. A page that was blocked, or a call that read nothing, costs nothing. Days are UTC. Totals by site and key come from request lines, kept 30 days. <a href="/docs/limits/#hosted-api-and-mcp">Limits</a> has the details.</p></section>`
const keysBody = `<section class="panel" aria-labelledby="keys-title"><div class="panel-head"><h2 id="keys-title">API keys</h2><span class="dash-small">At most five active keys</span></div>
<p>Send a key as <code>Authorization: Bearer &lt;key&gt;</code> to <code>https://api.octocrawl.dev</code> or <code>https://mcp.octocrawl.dev/mcp</code>. Its calls spend this account's credits and may use the browser.</p>
<form class="dash-form" id="key-form"><label for="key-label">Name (optional)<input id="key-label" name="label" maxlength="60" placeholder="laptop agent" autocomplete="off" /></label><button class="button" type="submit">Create key</button></form>
<div class="key-reveal" id="key-reveal" hidden><p>Your new key. Copy it now: it is shown only once.</p>${dashCode('new-key', '')}<p class="dash-small">Claude Code:</p>${dashCode('new-key-mcp', '')}</div>
<div class="table-scroll"><table class="dash-table"><thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th>This month</th><th>Status</th><th><span class="sr-only">Action</span></th></tr></thead><tbody id="keys-body"></tbody></table></div><p class="dash-small" id="keys-empty" hidden>No keys yet.</p></section>`
/** One client's setup on the Connect page: a row whose Install button opens its command or config, printed in. */
const installRow = (id, name, icon, note, code) => `<details class="install-row" id="c-${id}"><summary><span class="int-icon">${icon.endsWith('.svg') ? `<img src="/docs-assets/agent-clients/${icon}" width="22" height="22" alt="" />` : escape(icon)}</span><strong>${escape(name)}</strong><span class="install-btn">Install <span aria-hidden="true">▾</span></span></summary><div class="install-body"><p class="dash-small">${note}</p>${dashCode(`code-${id}`, code)}</div></details>`
/** The From code panel's tabs: one call in each language, each carrying the key set on the page. */
const CODE_TABS = [
  ['rest', 'REST', `curl https://api.octocrawl.dev/v1/scrape \\\n  -H 'authorization: Bearer oc_YOUR_KEY' \\\n  -H 'content-type: application/json' \\\n  -d '{"url":"https://example.com","formats":["markdown"]}'`],
  ['sdk', 'AI SDK', `npm install @octocrawl/ai-sdk ai zod\n\n// OCTOCRAWL_API_KEY=oc_YOUR_KEY\nimport { octocrawlTools } from '@octocrawl/ai-sdk'\nconst tools = octocrawlTools()`],
  ['ts', 'TypeScript', `npm install @octocrawl/sdk\n\nimport { W2L } from '@octocrawl/sdk'\nconst client = new W2L({ baseUrl: 'https://api.octocrawl.dev', token: 'oc_YOUR_KEY' })\nconst page = await client.scrape('https://example.com', { formats: ['markdown'] })`],
  ['python', 'Python', `pip install octocrawl-client\n\nfrom octocrawl_client import W2L\nclient = W2L(base_url="https://api.octocrawl.dev", token="oc_YOUR_KEY")\npage = client.scrape("https://example.com", formats=["markdown"])`],
]
const connectBody = `<div class="connect-grid">
<section class="panel" aria-labelledby="agents-title"><div class="panel-head"><div><h2 id="agents-title">Coding agents</h2><p class="dash-small">Add hosted Octocrawl to your agent with one command or one config entry.</p></div></div>
${installRow('claude', 'Claude Code', 'claude-code.svg', 'Run in a terminal; add <code>--scope user</code> to have it in every project.', 'claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp --header "Authorization: Bearer oc_YOUR_KEY"')}
${installRow('codex', 'Codex', 'codex.svg', 'Codex reads the key from an environment variable.', 'export OCTOCRAWL_API_KEY=oc_YOUR_KEY\ncodex mcp add octocrawl --url https://mcp.octocrawl.dev/mcp --bearer-token-env-var OCTOCRAWL_API_KEY')}
${installRow('cursor', 'Cursor', 'cursor.svg', 'Merge into <code>.cursor/mcp.json</code>; <code>"Bearer ${env:OCTOCRAWL_API_KEY}"</code> reads the key from the environment.', '{ "mcpServers": { "octocrawl": { "url": "https://mcp.octocrawl.dev/mcp", "headers": { "Authorization": "Bearer oc_YOUR_KEY" } } } }')}
${installRow('opencode', 'OpenCode', 'opencode.svg', 'Merge into the <code>mcp</code> object of <code>opencode.json</code>.', '{ "mcp": { "octocrawl": { "type": "remote", "url": "https://mcp.octocrawl.dev/mcp", "enabled": true, "headers": { "Authorization": "Bearer oc_YOUR_KEY" } } } }')}
${installRow('cline', 'Cline', 'CL', 'Merge into <code>cline_mcp_settings.json</code> (MCP Servers → Configure), keeping your other servers.', '{ "mcpServers": { "octocrawl": { "type": "streamableHttp", "url": "https://mcp.octocrawl.dev/mcp", "headers": { "Authorization": "Bearer oc_YOUR_KEY" }, "disabled": false } } }')}
</section>
<section class="panel" aria-labelledby="mcp-title"><div class="panel-head"><div><h2 id="mcp-title">MCP</h2><p class="dash-small">Point any MCP client at the hosted server and send your key in the <code>Authorization: Bearer</code> header, never in the URL.</p></div><a href="/docs/connect-mcp/">Docs →</a></div>
<div class="field-box"><p class="field-label">URL</p>${dashCode('mcp-url', 'https://mcp.octocrawl.dev/mcp')}</div>
<div class="field-box" id="fill-form"><p class="field-label"><label for="fill-key">OCTOCRAWL_API_KEY</label></p><div class="key-field"><input id="fill-key" class="masked" type="text" maxlength="200" placeholder="Paste a key, or create one" autocomplete="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore /><button class="icon-button" type="button" id="fill-eye" aria-pressed="false" aria-label="Show the key">◉</button><button class="copy" type="button" id="fill-copy">Copy</button></div>
<div class="key-actions"><button class="button small" type="button" id="fill-create">Create a key</button><span class="dash-small">Your newest key starts <code id="conn-key">oc_…</code></span></div>
<p class="dash-small" id="fill-note" role="status" aria-live="polite">A key is shown only once, so this page cannot fill in one you made earlier. A key you paste stays in this page: it is not sent anywhere or kept. Every setup here carries it.</p></div></section>
<section class="panel" aria-labelledby="code-title"><div class="panel-head"><h2 id="code-title">From code</h2><a href="/docs/reference/">API reference →</a></div>
<div class="tabs code-tabs" role="group" aria-label="Language">${CODE_TABS.map(([id, name], i) => `<button type="button" aria-pressed="${i === 0}" data-code-tab="${id}"${id === 'rest' ? ' id="c-rest"' : id === 'sdk' ? ' id="c-sdk"' : ''}>${escape(name)}</button>`).join('')}</div>
${CODE_TABS.map(([id, , code], i) => `<div class="code-pane" data-code-pane="${id}"${i === 0 ? '' : ' hidden'}>${dashCode(`c-${id}-code`, code)}</div>`).join('')}</section>
<section class="panel" aria-labelledby="c-local"><div class="panel-head"><div><h2 id="c-local">On your computer</h2><p class="dash-small">Free and without limit, with every tool: crawl, batch and Monitor too. No key and no credits.</p></div></div>
<div class="field-box"><p class="field-label">REST API on 127.0.0.1:8787</p>${dashCode('c-local-code', 'npx octocrawl serve')}</div>
<div class="field-box"><p class="field-label">MCP server over stdio</p>${dashCode('c-local-mcp', 'npx -y @octocrawl/mcp')}</div></section>
</div>`
/**
 * A Playground page, laid out as Firecrawl's: a selector on top, the URL card in a band below it, then the result and
 * the account's recent runs. The selector is Octocrawl's own: one button naming the endpoint, which opens a panel of
 * tiles printed in the site's style (scrape, map, and crawl on your own computer). Behind the card the home page's
 * octopus, drawn in glyphs, peeks over its top edge and reaches out on both sides; the recent runs are receipts over a
 * slow current of glyphs. Both pages are one layout: dashboard.js switches between them in place and sends the card to
 * POST /api/account/run, which the hosted API charges like a key's call; dashboard-octopus.js draws the glyphs.
 */
const PLAYGROUND_MODES = {
  scrape: ['Extract', 'Scrape', '▤', 'One page as Markdown, links, page info or fields, with its Evidence Record.', '1–5 credits'],
  map: ['Discover', 'Map', '⌗', 'Every URL of a site, from its sitemap and its links.', '0–1 credit'],
}
/** The home page's format tiles (src/page.ts), word for word; dashboard.js draws each icon on the same glyph grid. */
const formatTiles = [['markdown', 'Markdown', 'readable text', '.md'], ['links', 'Links', 'every link on the page', '.links.txt'], ['info', 'Page info', 'title, language; a file\'s pages', '.info.json'], ['fields', 'Fields', 'the fields set in Options', '.fields.json'], ['json', 'JSON', 'the whole result', '.json']]
  .map(([view, name, note, ext], i) => `<label class="format-tile"><input type="radio" name="view" value="${view}"${i === 0 ? ' checked' : ''} /><span class="tile-icon" data-icon="${view}" aria-hidden="true"></span><span class="tile-name">${name}</span><span class="tile-note">${note}</span><span class="tile-ext">${ext}</span></label>`).join('')
const playgroundBody = (endpoint) => {
  const only = (which) => `data-only="${which}"${which === endpoint ? '' : ' hidden'}`
  const [kicker, name, glyph] = PLAYGROUND_MODES[endpoint]
  const tile = (which) => { const [k, n, g, about, cost] = PLAYGROUND_MODES[which]; return `<button class="pg-tile" type="button" data-endpoint="${which}" aria-pressed="${which === endpoint}"><span class="pg-tile-glyph" aria-hidden="true">${g}</span><span class="pg-kicker">${k}</span><strong>${n}</strong><span class="pg-tile-about">${about}</span><code>${cost}</code></button>` }
  // The home page's five views of one extraction (src/page.ts, format tiles), then the Evidence Record the API adds.
  const views = [['markdown', 'Markdown', 'scrape'], ['links', 'Links', ''], ['info', 'Page info', 'scrape'], ['fields', 'Fields', 'scrape'], ['json', 'JSON', ''], ['evidence', 'Evidence Record', 'scrape']]
    .map(([view, n, which]) => `<button type="button" role="tab" aria-selected="false" data-view="${view}"${which ? ` ${only(which)}` : ''}>${n}</button>`).join('')
  const cross = (where) => `<span class="pg-cross ${where}" aria-hidden="true">+</span>`
  return `<section class="pg" id="pg" data-endpoint="${endpoint}">
<div class="pg-frame">
<div class="pg-top">${cross('tl')}${cross('tr')}<button class="pg-picker" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="pg-modes" data-panel="pg-modes"><span class="pg-kicker" id="pg-picker-kicker">${kicker}</span><span class="pg-picker-name"><span class="pg-glyph" id="pg-picker-glyph" aria-hidden="true">${glyph}</span><span id="pg-picker-name">${name}</span></span><span class="pg-caret" aria-hidden="true">▾</span></button>
<div class="pg-panel pg-modes" id="pg-modes" role="dialog" aria-label="What to run" hidden><p class="pg-kicker">What to run</p><div class="pg-tiles">${tile('scrape')}${tile('map')}<a class="pg-tile is-local" href="/dashboard/connect/#c-local"><span class="pg-tile-glyph" aria-hidden="true">&gt;_</span><span class="pg-kicker">On your computer</span><strong>Crawl</strong><span class="pg-tile-about">Crawl, batch and Monitor run on your own machine, free and without limit.</span><code>npx octocrawl serve</code></a></div></div></div>
<div class="pg-band" id="pg-stage">${cross('bl')}${cross('br')}<div class="pg-depth" aria-hidden="true"><canvas class="pg-octopus" id="pg-octopus"></canvas></div>
<form class="pg-card" id="play-form" data-endpoint="${endpoint}" novalidate>
<div class="pg-entry"><label class="pg-chip" for="play-url">URL</label><input id="play-url" name="url" type="url" inputmode="url" required placeholder="Paste a public page URL…" autocomplete="off" spellcheck="false" /></div>
<div class="pg-toolbar"><div class="pg-tools">
<button class="pg-tool" type="button" aria-expanded="false" aria-controls="pg-format" data-panel="pg-format" ${only('scrape')}><span class="pg-glyph" aria-hidden="true">▤</span><span class="sr-only">Format: </span><span id="pg-format-label">Markdown</span></button>
<button class="pg-tool" type="button" aria-expanded="false" aria-controls="pg-options" data-panel="pg-options"><span class="pg-glyph" aria-hidden="true">≡</span>Options<span class="pg-badge" id="pg-options-badge" hidden></span></button></div>
<div class="pg-tools"><span class="pg-cost" id="play-cost"></span><button class="pg-tool" type="button" aria-expanded="false" aria-controls="pg-code" data-panel="pg-code"><span class="pg-glyph" aria-hidden="true">&lt;/&gt;</span>Get code</button><button class="pg-go" type="submit" id="play-submit"><span id="pg-go-label">${endpoint === 'scrape' ? 'Extract page' : 'Map site'}</span> <span aria-hidden="true">→</span></button></div></div>
<div class="pg-panel wide pg-formats" id="pg-format" hidden><p class="pg-kicker">Format</p><div class="format-tiles" role="radiogroup" aria-label="Format">${formatTiles}</div><p class="dash-small">All from one run, so switching never costs another credit.</p></div>
<div class="pg-panel wide" id="pg-options" hidden><p class="pg-kicker">Options</p>
<div class="pg-read" ${only('scrape')}><p class="pg-label" id="pg-read-title">Read</p><div class="pg-scope" role="radiogroup" aria-labelledby="pg-read-title"><label><input type="radio" name="scope" value="main" checked /> Main content</label><label><input type="radio" name="scope" value="whole" /> Whole page</label></div><p class="dash-small" id="pg-scope-note"></p></div>
<section class="pg-fields-editor" ${only('scrape')} aria-labelledby="pg-fields-title"><div class="pg-fields-head"><p class="pg-label" id="pg-fields-title">Fields</p><span class="pg-count" id="pg-fields-count"></span><button class="pg-link" id="pg-fields-preset" type="button" aria-label="Use the product fields: name, brand, price, currency, availability, SKU, rating and review count">+ product fields</button></div>
<div class="pg-field-list" id="pg-field-list" role="list" aria-labelledby="pg-fields-title"></div>
<div class="pg-field-new"><span aria-hidden="true">›</span><input id="pg-field-new" maxlength="64" autocomplete="off" spellcheck="false" aria-label="New field name" placeholder="add a field: type a name, then Enter" /><button class="pg-link" id="pg-field-add" type="button">add</button></div>
<p class="pg-error" id="pg-fields-error" role="alert"></p>
<p class="dash-small">Read from the page itself: JSON-LD, microdata, meta tags, tables and a PDF's "Label: value" lines. No AI: a field the page does not state comes back empty, with the reason. Amazon.sg product pages take no options.</p></section>
<div class="pg-fields" ${only('map')}><label>Search<input name="search" maxlength="200" placeholder="docs" autocomplete="off" /></label><label>Limit<input name="limit" type="number" min="1" max="5000" value="100" /></label></div></div>
<div class="pg-panel wide" id="pg-code" hidden><div class="panel-head"><p class="pg-kicker">Get code</p><div class="tabs" role="group" aria-label="Language"><button type="button" aria-pressed="true" data-lang="curl">cURL</button><button type="button" aria-pressed="false" data-lang="js">JavaScript</button></div></div>${dashCode('play-code', '')}<p class="dash-small">The same call from your code or agent: put a key from <a href="/dashboard/keys/">API keys</a> where it says <code>oc_YOUR_KEY</code>. It costs what a run here costs.</p></div>
</form>
<p class="pg-note" id="play-summary" role="status" aria-live="polite"></p></div>
</div>
<section class="panel pg-result" id="play-result" hidden aria-labelledby="result-title"><div class="panel-head"><div><h2 id="result-title">Result</h2><p class="dash-small" id="play-detail"></p></div><span class="status" id="play-status"></span></div>
<div class="tabs play-views" role="tablist" aria-label="Result view">${views}</div>
<dl class="facts play-evidence" id="play-evidence" hidden></dl>
<div class="code"><pre class="play-output" id="play-output" tabindex="0"></pre><button class="copy" type="button" data-copy="play-output">Copy</button></div></section>
<section class="pg-runs" aria-labelledby="runs-title"><pre class="pg-sea" id="pg-sea" aria-hidden="true"></pre><div class="pg-runs-head"><div><p class="pg-kicker">Receipts</p><h2 id="runs-title">Recent runs</h2></div><a href="/dashboard/activity/">Activity →</a></div><div class="receipts" id="run-cards"></div><p class="dash-small pg-runs-empty" id="runs-empty" hidden>No runs here yet. Each run leaves a receipt here and a line on Activity: what was read, what robots.txt allowed, what it cost and the SHA-256 of what came back.</p></section>
</section>`
}
/** Settings: who is signed in and how, the plan and its credits, the account's data, this browser's preferences. */
const settingsBody = `<div class="settings-grid">
<section class="panel" aria-labelledby="profile-title"><div class="panel-head"><h2 id="profile-title">Profile</h2></div><dl class="facts">
<dt>Email</dt><dd id="acct-email">…</dd>
<dt>Sign-in methods</dt><dd><span class="chips" id="acct-providers"></span></dd>
</dl><p class="dash-small">To add GitHub or Google, sign in with it once using this email address. Octocrawl then asks you to sign in a way you already use, and links it.</p></section>
<section class="panel" aria-labelledby="plan-title"><div class="panel-head"><h2 id="plan-title">Plan and credits</h2><a href="/dashboard/usage/">Usage →</a></div><dl class="facts">
<dt>Plan</dt><dd id="acct-plan">…</dd>
<dt>This month</dt><dd id="acct-month">…</dd>
<dt>Bought credits</dt><dd id="acct-bought">…</dd>
</dl><p class="dash-small">Credits and keys are covered by the <a href="/docs/terms/">terms</a>.</p></section>
<section class="panel" aria-labelledby="data-title"><div class="panel-head"><h2 id="data-title">Data and privacy</h2><a href="/docs/privacy/">Privacy →</a></div>
<p>Each call made with your keys or in the Playground leaves a request line: the URL asked for, the formats, what came back, how long it took and what it cost, with the SHA-256 of what was read. Never the page's content. Only you see these lines, and each one is deleted 30 days after the call.</p>
<button class="button quiet" type="button" id="settings-export">Export request lines (CSV)</button></section>
<section class="panel" aria-labelledby="prefs-title"><div class="panel-head"><h2 id="prefs-title">Preferences</h2><span class="dash-small">kept in this browser only</span></div>
<form class="prefs" id="prefs-form"><label for="pref-view">Playground format<select id="pref-view" name="view"><option value="markdown">Markdown</option><option value="links">Links</option><option value="info">Page info</option><option value="fields">Fields</option><option value="json">JSON</option></select></label>
<label for="pref-scope">Playground reads<select id="pref-scope" name="scope"><option value="main">Main content</option><option value="whole">Whole page</option></select></label>
<label for="pref-tz">Times of calls<select id="pref-tz" name="tz"><option value="utc">UTC</option><option value="local">This computer's time zone</option></select></label></form>
<p class="dash-small" id="prefs-note" role="status" aria-live="polite">Days on the usage charts stay UTC, as credits are counted.</p></section>
</div>
<section class="panel" aria-labelledby="out-title"><div class="panel-head"><h2 id="out-title">Session</h2></div><p>Signing out ends this session in this browser. Your keys keep working.</p><form method="post" action="/auth/logout"><button class="button quiet" type="submit">Sign out</button></form></section>
<section class="panel danger" aria-labelledby="delete-title"><div class="panel-head"><h2 id="delete-title">Delete account</h2></div>
<p>Deleting your account deletes, at once and for good: your API keys (they stop working within a minute), your credits, bought ones included, your daily usage, your request lines, and your sign-in record and sessions. Service logs that name the account's id are deleted with the rest of the logs, 30 days on, as the <a href="/docs/privacy/">privacy page</a> says.</p>
<p>To confirm, type your email address, then sign in once more the way you usually do. The account is deleted as soon as you are signed in.</p>
<div class="dash-form delete-form"><label for="delete-confirm"><span id="delete-label">Your email address</span><input id="delete-confirm" autocomplete="off" spellcheck="false" /></label><button class="button danger-button" type="button" id="delete-start" disabled>Delete account</button></div></section>`

/** Each page: its path, title, the line under the title, and its body. */
export const DASHBOARD_BODIES = [
  ['/dashboard/', 'Overview', 'This month\'s credits, the last 30 days of use, and the lines to connect an agent.', overviewBody],
  ['/dashboard/activity/', 'Activity', 'Every call made with your keys in the last 30 days: what was asked for, what came back, and what it cost.', activityBody],
  ['/dashboard/usage/', 'Usage', 'What the hosted API and MCP read for this account, day by day, and what it cost.', usageBody],
  ['/dashboard/scrape/', 'Scrape', 'Read one page as Markdown, with its Evidence Record, on this account\'s credits at the API\'s price.', playgroundBody('scrape')],
  ['/dashboard/map/', 'Map', 'List the URLs of a site from its sitemap and links, on this account\'s credits at the API\'s price.', playgroundBody('map')],
  ['/dashboard/keys/', 'API keys', 'Keys for agents and code. Each one spends this account\'s credits.', keysBody],
  ['/dashboard/connect/', 'Connect', 'Add Octocrawl to your agent or your code, or run it free on your own computer.', connectBody],
  ['/dashboard/settings/', 'Settings', 'Your profile, plan and data, and this browser\'s preferences.', settingsBody],
]
