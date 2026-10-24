import { glyphCloud } from './glyphArt'

/** The home page's "What it does", "Get started" and "Free tiers" sections. Build-time markup like page.ts: no DOM access, no styles.
 * featureMotion.ts brings them to life; without it every claim, mark and code line is already in the HTML, and the
 * controls that need a script (the filter, the tabs and Copy) stay hidden, and every free tier shows open.
 *
 * What the sections claim was checked against the product on 2026-10-09 (origin/main c25c126):
 * - Hosted Octocrawl serves scrape and map, and to an account crawl jobs of up to 500 pages and batch jobs of up to 1,000
 *   URLs (packages/mcp/src/hostedApi.ts refuses every other route by name; rechecked 2026-10-23, origin/main d1eb4647);
 *   larger crawls, Monitor, logins and the handoff to Chrome run on the person's computer.
 * - Allowances: five previews a visitor a day (VISITOR_DAILY_PREVIEWS, packages/public-preview/src/quota.ts); 20 pages a
 *   day per address without a key and 10 starts a minute (DEFAULT_KEYLESS_DAILY, KEYLESS_PER_MINUTE); an account's
 *   1,000 credits a month and 60 a minute (DEFAULT_MONTHLY_CREDITS in packages/mcp/src/hostedCredits.ts, KEY_PER_MINUTE);
 *   1,500 pages a day for the whole hosted service; no daily limit on the person's own computer.
 * - `npx octocrawl serve` runs a Monitor when asked (POST /v1/monitors/:id/run) and delivers its events; timed re-runs
 *   come from the repository's managed local service (packages/mcp/src/managedRuntime.ts), as content/reference.md says.
 *   A delivery is signed when its destination names a secret (packages/runtime/src/deliveryWorker.ts).
 * - The Get started lines were run that day as written: `npx octocrawl@0.3.1` scrape (its first line of output is the
 *   one shown), map, and batch with `--out results` (the files listed are the ones it wrote); the curl call, and
 *   @octocrawl/sdk 0.3.1 and octocrawl-client 0.3.1, against https://api.octocrawl.dev (all returned success). The MCP
 *   command is the one Connect MCP marks verified on 2026-10-06. The Evidence Record lines are example.com's from a hosted scrape that day. */

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A line of glyph art: `{…}` marks the accent, written as <b>. */
const art = (lines: readonly string[]) => lines.map(line => esc(line).replace(/\{([^}]*)\}/g, '<b>$1</b>')).join('\n')

// `points`: what it does, a short line each, read at a glance.
type Capability = { key: string, hosted: boolean, title: string, points: readonly string[], art: readonly string[] }

export const CAPABILITIES: readonly Capability[] = [
  {
    key: 'scrape', hosted: true, title: 'Scrape a page',
    points: ['Markdown, links, metadata and structured fields', 'From one public URL', 'Hosted browser lane requires an account key'],
    art: [
      '┌──────────┐',
      '│ ░▒░░▒▒░░ │    # Overview',
      '│ ▒░░▒░ ░▒ │ {─›} the text…',
      '│ ░▒▒░░▒   │    - [links]',
      '└──────────┘    | tables |',
    ],
  },
  {
    key: 'map', hosted: true, title: 'Map a site',
    points: ['The URLs a site lists in its sitemap and links', 'Before you read a single page'],
    art: [
      '{×} site.example',
      ' ├─ /docs',
      ' │   ├─ /docs/start',
      ' │   └─ /docs/api',
      ' └─ /blog',
    ],
  },
  {
    key: 'crawl', hosted: true, title: 'Crawl a site',
    points: ['Follow links across a site or section', 'Set page, depth and path limits', 'Hosted with an account, up to 500 pages'],
    art: ['site.example', ' ├─ /docs {─›} /docs/start', ' ├─ /blog {─›} /blog/post', ' └─ page limit ✓', '    depth limit ✓'],
  },
  {
    key: 'batch', hosted: true, title: 'Scrape a batch',
    points: ['Scrape a list of URLs', 'Keep each result, including failures', 'Hosted with an account, up to 1,000 URLs'],
    art: ['[URL 1, URL 2, URL 3]', '        {│}', '   ✓ Markdown', '   × blocked', '   ✓ Markdown'],
  },
  {
    key: 'actions', hosted: false, title: 'Browser actions',
    points: ['Click, scroll and load content before extracting it', 'Run browser actions on your computer', 'Install Chromium for the browser lane'],
    art: ['┌ browser ───────────┐', '│ click {›} scroll     │', '│ load more content │', '│ {↓} extract         │', '└───────────────────┘'],
  },
  {
    key: 'monitor', hosted: false, title: 'Monitor a page',
    points: ['Revisit sources on a schedule with local workers', 'Deliver events to your HTTPS webhook', 'Timed re-runs need a repository checkout'],
    art: [' run ·──·──·──{×}──·', '              │', '           changed', '              └─{›} POST /webhook', '                 signed ✓'],
  },
]

/** A line in the Get started window: a comment, a command (its prompt is drawn), a command's continuation, a line
 * of code, what the command printed, a request to an agent, or a gap. */
type Line = readonly ['note' | 'cmd' | 'more' | 'code' | 'out' | 'ask' | 'gap', string]
type Client = { key: string, label: string, title: string, lines: readonly Line[], note: string }

/** The ways in, each a few steps that were run as written (see the header). */
export const CLIENTS: readonly Client[] = [
  {
    key: 'cli', label: 'CLI', title: 'terminal',
    lines: [
      ['note', '# Read one page as Markdown: nothing to install, no key'],
      ['cmd', 'npx octocrawl scrape https://example.com --markdown'],
      ['out', 'This domain is for use in documentation examples without needing permission. …'],
      ['gap', ''],
      ['note', '# List the pages a site links to'],
      ['cmd', 'npx octocrawl map https://example.com'],
      ['gap', ''],
      ['note', '# Read a list of pages and keep every result with its evidence'],
      ['cmd', 'npx octocrawl batch https://example.com https://example.org --out results'],
      ['cmd', 'ls results'],
      ['out', '0001-example.com.md  0002-example.org.md  report.json  results.csv  results.jsonl'],
    ],
    note: 'Runs on your computer with Node.js 22.13 or later: no server, no key, no daily limit. <a href="/docs/reference/">Advanced reference</a>',
  },
  {
    key: 'mcp', label: 'MCP', title: 'terminal · your agent',
    lines: [
      ['note', '# Add hosted Octocrawl to Claude Code: one URL, no key to start'],
      ['cmd', 'claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp'],
      ['gap', ''],
      ['note', '# Then ask your agent'],
      ['ask', 'Use Octocrawl to read https://example.com and give me its Markdown.'],
    ],
    note: 'Cursor, OpenCode and Codex take the same URL. <a href="/docs/connect-mcp/">Connect MCP</a>',
  },
  {
    key: 'ts', label: 'TypeScript', title: 'app.ts',
    lines: [
      ['note', '// npm install @octocrawl/sdk'],
      ['code', "import { W2L } from '@octocrawl/sdk'"],
      ['gap', ''],
      ['code', "const octo = new W2L({ baseUrl: 'https://api.octocrawl.dev' })"],
      ['code', "const page = await octo.scrape('https://example.com')"],
      ['code', 'console.log(page.markdown)'],
    ],
    note: 'Hosted, keyless within the daily allowance; or <code>http://127.0.0.1:8787</code> after <code>npx octocrawl serve</code>. <a href="/docs/reference/">Advanced reference</a>',
  },
  {
    key: 'py', label: 'Python', title: 'app.py',
    lines: [
      ['note', '# pip install octocrawl-client'],
      ['code', 'from octocrawl_client import W2L'],
      ['gap', ''],
      ['code', 'octo = W2L(base_url="https://api.octocrawl.dev")'],
      ['code', 'page = octo.scrape("https://example.com")'],
      ['code', 'print(page["markdown"])'],
    ],
    note: 'Hosted, keyless within the daily allowance; or <code>http://127.0.0.1:8787</code> after <code>npx octocrawl serve</code>. <a href="/docs/reference/">Advanced reference</a>',
  },
  {
    key: 'rest', label: 'REST', title: 'terminal',
    lines: [
      ['note', '# Hosted: no key within the daily allowance'],
      ['cmd', 'curl -sS -X POST https://api.octocrawl.dev/v1/scrape \\'],
      ['more', "  -H 'content-type: application/json' \\"],
      ['more', `  -d '{"url":"https://example.com","formats":["markdown"]}'`],
    ],
    note: "Add <code>-H 'authorization: Bearer &lt;key&gt;'</code> to spend your account's credits instead. <a href=\"/docs/limits/\">Limits and result states</a>",
  },
]

/** What Copy puts on the clipboard: the commands and code, without comments, output or prompts. */
export const clientCopy = (c: Client) => c.lines.filter(([kind]) => kind === 'cmd' || kind === 'more' || kind === 'code' || (kind === 'gap' && c.lines.some(([k]) => k === 'code'))).map(([, text]) => text).join('\n').trim()

type Tier = {
  /** `perDay` is the allowance's number; `per` its period, a day unless it says month (an account's credits). */
  n: string, name: string, perDay: number | null, per?: 'month', unit: string,
  facts: ReadonlyArray<readonly [string, string]>, link: readonly [href: string, label: string, arrow: string]
}

export const TIERS: readonly Tier[] = [
  {
    n: '01', name: 'Browser preview', perDay: 5, unit: 'previews a day, per visitor',
    facts: [['Where', 'This page'], ['Needs', 'Nothing: no account, no install'], ['Reads', 'One public page at a time']],
    link: ['#top', 'Try a page', '↑'],
  },
  {
    n: '02', name: 'Hosted, no key', perDay: 20, unit: 'pages a day, per address',
    facts: [['Where', '<code>api.octocrawl.dev</code>, <code>mcp.octocrawl.dev</code>'], ['Needs', 'Nothing'], ['Reads', 'Scrape and map over HTTP, 10 a minute']],
    link: ['/docs/connect-mcp/', 'Connect MCP', '↗'],
  },
  {
    n: '03', name: 'Hosted, with an account', perDay: 1000, per: 'month', unit: 'credits a month, free',
    facts: [['Where', 'The same two addresses'], ['Needs', 'An account: sign in with GitHub, Google or email, then make a key'], ['Reads', 'HTTP at 1 credit a page, then a browser at 5, 60 a minute']],
    link: ['/signin/', 'Sign in', '→'],
  },
  {
    n: '04', name: 'Your computer', perDay: null, unit: 'no daily limit',
    facts: [['Where', '<code>npx octocrawl serve</code>'], ['Needs', 'Node.js 22.13 or later; for a browser, <code>npx playwright install chromium</code>'], ['Reads', 'Everything above; timed Monitors from a repository checkout']],
    link: ['/docs/connect-mcp/#run-it-on-your-computer', 'Run it yourself', '↗'],
  },
]

/** The number a tier shows, from its allowance, so the two cannot drift apart. */
export const tierAmount = (perDay: number | null) => perDay === null ? '∞' : perDay.toLocaleString('en-US')

/** What the planet shows for a tier: one lit mark for each page a day, or every mark on the planet for no daily
 * limit. It shows only once the lights are drawn (featureMotion.ts), so it never claims marks that are not lit. */
export const tierLit = (t: Tier) => t.perDay === null
  ? 'Every mark on the planet lit'
  : `${tierAmount(t.perDay)} lit mark${t.perDay === 1 ? '' : 's'} on the planet`

/** A tier's unit without its qualifier ("previews a day, per visitor" is "previews a day"), for the planet's readout. */
export const tierUnit = (t: Tier) => t.unit.split(',')[0]!

function capabilityCell(item: Capability): string {
  const hosted = item.hosted ? 'is-yes' : 'is-no'
  return `<li class="can-cell" data-hosted="${item.hosted}">
                <pre class="can-art" aria-hidden="true">${art(item.art)}</pre>
                <h3>${item.title}</h3>
                <ul class="can-points" role="list">${item.points.map(point => `<li>${point}</li>`).join('')}</ul>
                <p class="can-where"><span class="${hosted}">Hosted<span class="visually-hidden">${item.hosted ? ': yes' : ': no'}</span></span><span class="is-yes">Your computer<span class="visually-hidden">: yes</span></span></p>
              </li>`
}

function clientLine([kind, text]: Line): string {
  if (kind === 'gap') return ''
  if (kind === 'cmd') return `<span class="use-prompt" aria-hidden="true">›</span>${esc(text)}`
  if (kind === 'ask') return `<span class="ln-ask" aria-hidden="true">»</span><span class="ln-asked">${esc(text)}</span>`
  return `<span class="ln-${kind}">${esc(text)}</span>`
}

function clientPanels(): string {
  const tabs = CLIENTS.map((c, i) => `<button class="use-tab" type="button" role="tab" id="use-tab-${c.key}" aria-controls="use-panel-${c.key}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''}><span class="row-mark" aria-hidden="true"></span>${c.label}</button>`).join('')
  const panels = CLIENTS.map(c => `<div class="use-panel" role="tabpanel" id="use-panel-${c.key}" aria-labelledby="use-tab-${c.key}" data-title="${esc(c.title)}" data-copy="${esc(clientCopy(c))}">
                <p class="use-panel-label" aria-hidden="true">${c.label}</p>
                <pre class="use-code" tabindex="0">${c.lines.map(clientLine).join('\n')}</pre>
                <p class="use-note">${c.note} <span aria-hidden="true">↗</span></p>
              </div>`).join('')
  return `<div class="use-tabs" role="tablist" aria-label="Use Octocrawl from" hidden>${tabs}</div>
            <div class="use-window" id="use-window">
              <div class="use-bar">
                <span class="use-marks" aria-hidden="true">×·+</span>
                <span class="use-label" id="use-title">${esc(CLIENTS[0]!.title)}</span>
                <button class="use-copy" type="button" id="use-copy" hidden>Copy</button>
              </div>
              ${panels}
              <p class="visually-hidden" id="use-status" role="status"></p>
            </div>`
}

/** Section 03: getting started, a few lines in each of the ways in. */
export function startMarkup(bar: string): string {
  return `<section class="start-section" id="get-started" aria-labelledby="start-title">
      ${bar}
      <div class="band">
        <div class="frame start-wrap">
          <div class="start-head">
            <pre class="glyph-cloud" data-cols="150" data-rows="30" data-seed="11" data-weather aria-hidden="true">${glyphCloud(150, 30, 11)}</pre>
            <p class="section-kicker"><span class="kicker-square"></span> GET STARTED</p>
            <h2 id="start-title">Start in your browser.<br />Build with your agent <em>or code.</em></h2>
            <p class="start-lead">Try a single page at <a href="https://octocrawl.dev/">octocrawl.dev</a>. Connect through MCP, use the REST API, or work with the TypeScript and Python clients.</p>
            <button class="sea-play" type="button" hidden><span aria-hidden="true">( </span>play with the octopus<span aria-hidden="true"> )</span></button>
          </div>
          <p class="start-scope">Hosted Octocrawl supports scrape and map, and with an account crawl and batch jobs. Run locally for larger jobs, browser actions and scheduled monitoring with local workers. <a href="/docs/limits/#hosted-api-and-mcp">See hosted limits</a>.</p>
          <p class="start-identity">Octocrawl is an open-source web scraping tool for AI agents and developers. Its official website is <a href="https://octocrawl.dev/">octocrawl.dev</a>, and its source code is maintained at <a href="https://github.com/77777R7/Octocrawl">github.com/77777R7/Octocrawl</a>. The local MCP package is <code>@octocrawl/mcp</code>; the API, SDK and hosted MCP examples are below.</p>
          ${clientPanels()}
        </div>
      </div>
    </section>`
}

/** Section 02: what the engine does beyond the preview, and where each part runs. */
export function capabilitiesMarkup(bar: string): string {
  const hostedCount = CAPABILITIES.filter(c => c.hosted).length
  return `<section class="can-section" id="what-it-does" aria-labelledby="can-title">
      ${bar}
      <div class="band">
        <div class="frame can-wrap">
          <div class="can-head">
            <div class="can-intro">
              <p class="section-kicker"><span class="kicker-square"></span> WHAT IT DOES</p>
              <h2 id="can-title">From one page to<br />a repeatable <em>workflow.</em></h2>
              <p class="can-lead">Read a page, discover URLs, collect content across a site, or revisit sources on a schedule. Each capability below shows where it runs.</p>
            </div>
            <fieldset class="can-filter" hidden>
              <legend class="visually-hidden">Show what runs where</legend>
              <label><input type="radio" name="can-where" value="all" checked /><span class="can-bracket" aria-hidden="true">[</span>All <span class="can-count">${CAPABILITIES.length}</span><span class="can-bracket" aria-hidden="true">]</span></label>
              <label><input type="radio" name="can-where" value="hosted" /><span class="can-bracket" aria-hidden="true">[</span>Hosted <span class="can-count">${hostedCount}</span><span class="can-bracket" aria-hidden="true">]</span></label>
              <label><input type="radio" name="can-where" value="local" /><span class="can-bracket" aria-hidden="true">[</span>Your computer <span class="can-count">${CAPABILITIES.length}</span><span class="can-bracket" aria-hidden="true">]</span></label>
            </fieldset>
          </div>
          <ul class="can-grid" id="can-grid" role="list">
              ${CAPABILITIES.map(capabilityCell).join('\n              ')}
          </ul>
          <div class="can-evidence">
            <h3>Keep the source with the result.</h3>
            <p>Scrape results include an Evidence Record describing the capture: the final URL, fetch time, HTTP status and access decision. Inspect separate <a href="/docs/limits/#interpret-the-status">verification results</a> when your task needs checked fields.</p>
          </div>
          <p class="visually-hidden" id="can-status" role="status"></p>
        </div>
      </div>
    </section>`
}

/** Section 04: the four free ways to use Octocrawl, every one written out in full, over the Earth artwork. With a
 * script the planet stays in view behind the section while the words scroll past it as usual: the tier crossing the
 * middle of the screen is the one lit, it lights as many of the planet's painted marks (featureMotion.ts,
 * earthLights.ts), and a readout on the planet says which of the four it is and what it allows. Nothing folds and
 * nothing is pinned but the planet. Without a script the tiers simply follow one another over the artwork as
 * painted. */
export function tiersMarkup(bar: string): string {
  const rows = TIERS.map(t => `<div class="tier-row" id="tier-${t.n}" data-lights="${t.perDay ?? 'all'}" data-unit="${esc(tierUnit(t))}" data-lit="${esc(tierLit(t))}">
              <h3 class="tier-head"><span class="tier-n" aria-hidden="true">${t.n}</span><span class="tier-name">${t.name}</span><span class="tier-leader" aria-hidden="true"></span><span class="tier-amount"><b>${tierAmount(t.perDay)}</b>${t.perDay === null ? '<span class="visually-hidden"> no daily limit</span>' : ` a ${t.per ?? 'day'}`}</span></h3>
              <div class="tier-panel">
                <p class="tier-unit">${t.unit}</p>
                <dl class="tier-facts">${t.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
                <a class="tier-link" href="${t.link[0]}">${t.link[1]} <span aria-hidden="true">${t.link[2]}</span></a>
              </div>
            </div>`).join('\n            ')
  const first = TIERS[0]!
  return `<section class="tier-section is-earth" id="free-tiers" aria-labelledby="tier-title">
      <div class="earth-art" aria-hidden="true"><img src="/assets/scene-earth.webp" alt="" width="1672" height="941" loading="lazy" decoding="async" /></div>
      ${bar}
      <div class="band">
        <div class="frame tier-wrap" id="earth-window">
          <div class="tier-copy" id="tier-copy">
            <div class="can-intro">
              <p class="section-kicker"><span class="kicker-square"></span> FREE TIERS</p>
              <h2 id="tier-title">Free to start,<br />four <em>ways.</em></h2>
              <p class="can-lead">None of them needs a card. Each mark that lights up on the planet stands for a page a day, or, for an account, a credit a month.</p>
              <p class="tier-hint" aria-hidden="true" hidden>Scroll to light the planet <span>↓</span></p>
            </div>
            <div class="tier-rail" id="tier-rail">
            ${rows}
            </div>
          </div>
          <div class="earth-readout" id="earth-readout" aria-hidden="true" hidden>
            <p class="earth-step"><b class="earth-step-n">${first.n}</b> / ${String(TIERS.length).padStart(2, '0')} · <span class="earth-step-name">${first.name}</span></p>
            <p class="earth-amount"><b class="earth-amount-n">${tierAmount(first.perDay)}</b> <span class="earth-amount-unit">${esc(tierUnit(first))}</span></p>
            <p class="earth-lit">${esc(tierLit(first))}</p>
            <p class="earth-ticks">${TIERS.map((_, i) => `<i${i === 0 ? ' class="is-on"' : ''}></i>`).join('')}</p>
          </div>
        </div>
      </div>
      <div class="band"><div class="frame tier-foot-band">
        <p class="tier-foot">The whole hosted service serves 1,500 pages a day; over an allowance the answer is HTTP 429 until 00:00 UTC, and for an account's credits until the 1st. Credit packs are planned but not sold yet. <a href="/docs/limits/">Limits and result states <span aria-hidden="true">↗</span></a></p>
      </div></div>
    </section>`
}
