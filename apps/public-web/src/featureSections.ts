import { glyphCloud } from './glyphArt'

/** The home page's "What it does" and "Get started" sections. Build-time markup like page.ts: no DOM access, no styles.
 * featureMotion.ts brings them to life; without it every claim, mark and code line is already in the HTML, and the
 * controls that need a script (the filter, the tabs and Copy) stay hidden.
 *
 * What the sections claim was checked against the product on 2026-10-09 (origin/main c25c126):
 * - Hosted Octocrawl serves scrape and map, and to an account crawl jobs of up to 500 pages and batch jobs of up to 1,000
 *   URLs (packages/mcp/src/hostedApi.ts refuses every other route by name; rechecked 2026-10-23, origin/main d1eb4647);
 *   larger crawls, Monitor, logins and the handoff to Chrome run on the person's computer.
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
