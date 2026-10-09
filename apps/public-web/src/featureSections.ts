import { glyphCloud } from './glyphArt'

/** The home page's "What it does", "Get started" and "Free tiers" sections. Build-time markup like page.ts: no DOM access, no styles.
 * featureMotion.ts brings them to life; without it every claim, mark and code line is already in the HTML, and the
 * controls that need a script (the filter, the tabs and Copy) stay hidden, and every free tier shows open.
 *
 * What the sections claim was checked against the product on 2026-10-09 (origin/main c25c126):
 * - Hosted Octocrawl serves scrape and map only (packages/mcp/src/hostedApi.ts refuses every other route by name); crawl,
 *   batch, Monitor, logins and the handoff to Chrome run on the person's computer.
 * - Allowances: five previews a visitor a day (VISITOR_DAILY_PREVIEWS, packages/public-preview/src/quota.ts); 20 pages a
 *   day per address without a key and 10 starts a minute (DEFAULT_KEYLESS_DAILY, KEYLESS_PER_MINUTE); a key's 1,000 to
 *   start and 60 a minute (content/limits.md, KEY_PER_MINUTE); 1,500 pages a day for the whole hosted service; no daily
 *   limit on the person's own computer.
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
    points: ['Markdown, links, tables and fields', 'From one URL', 'Over HTTP, or in a browser when the page needs one'],
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
    key: 'jobs', hosted: false, title: 'Crawl and batch',
    points: ['Follow a site’s links', 'Or read a list of up to 1,000 URLs', 'A crawl that stops resumes where it left off'],
    art: [
      '[{×××××××××}·······]',
      ' ✓ page 1   ✓ page 5',
      ' ✓ page 2   ✓ page 6',
      ' ✓ page 3   · page 7',
      ' ✓ page 4   {»} resume',
    ],
  },
  {
    key: 'monitor', hosted: false, title: 'Watch a page',
    points: ['A Monitor re-reads a page', 'Sends what changed to your HTTPS webhook, signed with your secret', 'Timed re-runs need a repository checkout'],
    art: [
      ' run ·──·──·──{×}──·',
      '              │',
      '           changed',
      '              └─{›} POST /webhook',
      '                 signed ✓',
    ],
  },
  {
    key: 'chrome', hosted: false, title: 'Your own Chrome',
    points: ['Read pages signed in as you', 'A page that stops at a check goes to your Chrome', 'You get past it yourself'],
    art: [
      '┌ your Chrome ─────────┐',
      '│ {●} signed in as you   │',
      '│ ▲ a check: you pass  │',
      '│ › Octocrawl reads on │',
      '└──────────────────────┘',
    ],
  },
  {
    key: 'evidence', hosted: true, title: 'An Evidence Record',
    points: ['Every result says where it came from', 'The final URL, HTTP status and robots.txt decision', 'A hash of what was read'],
    art: [
      'finalUrl       https://example.com',
      'httpStatus     {200}',
      'robots         no_robots',
      'rawBodySha256  25dd…e484',
      '',
    ],
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
    note: "Add <code>-H 'authorization: Bearer &lt;key&gt;'</code> for more pages a day. <a href=\"/docs/limits/\">Limits and result states</a>",
  },
]

/** What Copy puts on the clipboard: the commands and code, without comments, output or prompts. */
export const clientCopy = (c: Client) => c.lines.filter(([kind]) => kind === 'cmd' || kind === 'more' || kind === 'code' || (kind === 'gap' && c.lines.some(([k]) => k === 'code'))).map(([, text]) => text).join('\n').trim()

type Tier = {
  n: string, name: string, perDay: number | null, unit: string,
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
    n: '03', name: 'Hosted, with a key', perDay: 1000, unit: 'pages a day, to start',
    facts: [['Where', 'The same two addresses'], ['Needs', 'A key, issued by hand for now'], ['Reads', 'HTTP, then a browser when the key allows it, 60 a minute']],
    link: ['#waitlist', 'Ask for a key', '↓'],
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
export const tierCaption = (t: Tier) => t.perDay === null
  ? 'Every mark on the planet lit · no daily limit'
  : `${tierAmount(t.perDay)} lit marks · ${tierAmount(t.perDay)} ${t.unit.split(',')[0]}`

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
            <pre class="glyph-cloud" data-cols="150" data-rows="30" data-seed="11" aria-hidden="true">${glyphCloud(150, 30, 11)}</pre>
            <p class="section-kicker"><span class="kicker-square"></span> GET STARTED</p>
            <h2 id="start-title">One line in,<br />clean pages <em>out.</em></h2>
            <p class="start-lead">Use Octocrawl from your terminal, your code or your AI agent. Pick the one that fits how you work.</p>
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
              <h2 id="can-title">One link is<br />only the <em>start.</em></h2>
              <p class="can-lead">The preview reads one page. The same engine maps whole sites, runs batches, watches pages for changes and reads with your own logins, and every result carries its Evidence Record.</p>
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
          <p class="visually-hidden" id="can-status" role="status"></p>
        </div>
      </div>
    </section>`
}

/** Section 04: the four free ways to use Octocrawl, every one written out, over the Earth artwork that fills the
 * whole section. With a script the artwork stays in view while the tiers pass one by one, the scroll settles with a
 * tier in the middle of the screen, and that tier lights as many of the planet's painted marks (featureMotion.ts,
 * earthLights.ts). Without a script the tiers simply follow one another over the artwork as painted. */
export function tiersMarkup(bar: string): string {
  const rows = TIERS.map(t => `<div class="tier-row" id="tier-${t.n}" data-lights="${t.perDay ?? 'all'}" data-caption="${esc(tierCaption(t))}">
              <h3 class="tier-head"><span class="tier-n" aria-hidden="true">${t.n}</span><span class="tier-name">${t.name}</span><span class="tier-leader" aria-hidden="true"></span><span class="tier-amount"><b>${tierAmount(t.perDay)}</b>${t.perDay === null ? '<span class="visually-hidden"> no daily limit</span>' : ' a day'}</span></h3>
              <div class="tier-panel">
                <p class="tier-unit">${t.unit}</p>
                <dl class="tier-facts">${t.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
                <a class="tier-link" href="${t.link[0]}">${t.link[1]} <span aria-hidden="true">${t.link[2]}</span></a>
              </div>
            </div>`).join('\n            ')
  return `<section class="tier-section is-earth" id="free-tiers" aria-labelledby="tier-title">
      <div class="tier-stage">
      <div class="earth-art" aria-hidden="true"><img src="/assets/scene-earth.webp" alt="" width="1672" height="941" loading="lazy" decoding="async" /></div>
      ${bar}
      <div class="band">
        <div class="frame tier-wrap" id="earth-window">
          <div class="tier-copy" id="tier-copy">
            <div class="can-intro">
              <p class="section-kicker"><span class="kicker-square"></span> FREE TIERS</p>
              <h2 id="tier-title">Free to start,<br />four <em>ways.</em></h2>
              <p class="can-lead">None of them needs a card. Each mark that lights up on the planet stands for a page a day.</p>
              <p class="tier-hint" aria-hidden="true" hidden>Scroll to light the planet <span>↓</span></p>
            </div>
            <div class="tier-rail" id="tier-rail">
            ${rows}
            </div>
            <p class="tier-foot">The whole hosted service serves 1,500 pages a day; over an allowance the answer is HTTP 429 until 00:00 UTC. Credit packs are planned but not sold yet. <a href="/docs/limits/">Limits and result states <span aria-hidden="true">↗</span></a></p>
          </div>
          <p class="earth-caption" id="earth-caption" aria-hidden="true" hidden>${esc(tierCaption(TIERS[0]!))}</p>
        </div>
      </div>
      </div>
    </section>`
}
