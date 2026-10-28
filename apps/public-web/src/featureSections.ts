import { glyphCloud } from './glyphArt'
import { cardWindow, markdownSegments, type Segment } from './product/fxWindow'
import { foldedText } from './product/scrapeMarkdown'
import { DOCS } from './product/scrapeRun'

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

/** One capability on the home page: where it runs (`hosted`: hosted Octocrawl serves it too; every one runs on the
 * person's computer), its words on the left, its glyph in the banner, and its card on the right: a painting (its
 * scene in product/cardGlow.ts, so the light suits it) with a window of what it returns. The first window is a
 * recorded read; the others show the shape of each result on example addresses, and the section says so. */
type Capability = { key: string, hosted: boolean, title: string, where: string, text: string, glyph: string, chip: string, painting: string, scene: number, window: () => string }

const kb = (bytes: number) => `${Math.round(bytes / 1000)} KB`

/** The Python docs' datetime page, read with its content selected on 17 Oct 2026 (product/scrapeRun.ts, recorded in
 * research/hosted/2026-10-17-scrape-page-demos-e1e128d4.md): its title, the source line and the lead paragraph. */
function scrapeWindow(): string {
  const kept = DOCS.markdownHead.split('\n').filter(line => line.trim())
  const lead = foldedText(kept[2]!)
  return cardWindow({
    icon: 'docs', url: 'docs.python.org/3/library/datetime.html', tag: `${kb(DOCS.bytes)} → ${DOCS.markdownLines} lines`, wrap: true,
    label: 'The start of the Markdown Octocrawl returned for the Python docs datetime page, its content selected',
    source: DOCS.rawHead.replace(/\s+/g, ' ').slice(0, 900),
    lines: [[['p', '# '], ['h', foldedText(kept[0]!.slice(2))]], [['p', '']], markdownSegments(foldedText(kept[1]!)), [['p', '']], markdownSegments(lead)],
  })
}

const line = (...segments: Segment[]): Segment[] => segments

export const CAPABILITIES: readonly Capability[] = [
  {
    key: 'scrape', hosted: true, title: 'Scrape a page.', where: 'Hosted · Your computer', glyph: '#', chip: 'Scrape',
    text: 'One public URL in; Markdown, links, metadata and the fields you ask for out. A page that needs scripts opens in a browser, which on hosted Octocrawl takes an account key.',
    painting: 'nature-1', scene: 3, window: scrapeWindow,
  },
  {
    key: 'map', hosted: true, title: 'Map a site.', where: 'Hosted · Your computer', glyph: '├', chip: 'Map',
    text: 'The URLs a site lists in its sitemaps and links to from its start page, without reading each page. Near-duplicates fold into one, and what was left out is counted.',
    painting: 'sky-3', scene: 2,
    window: () => cardWindow({
      url: 'docs.example.com', tag: '6 URLs', label: 'An example of what a map returns: the URLs of a docs site',
      lines: [
        line(['v', 'docs.example.com/']),
        line(['p', '├─ '], ['v', '/guide/']),
        line(['p', '│  ├─ '], ['v', '/guide/install/']),
        line(['p', '│  └─ '], ['v', '/guide/config/']),
        line(['p', '├─ '], ['v', '/api/']),
        line(['p', '└─ '], ['v', '/changelog/']),
        line(['p', '']),
        line(['k', 'from '], ['a', 'links, sitemap.xml'], ['p', ' · '], ['k', 'left out '], ['a', '2 on other hosts']),
      ],
    }),
  },
  {
    key: 'crawl', hosted: true, title: 'Crawl a site.', where: 'Hosted with an account · Your computer', glyph: '»', chip: 'Crawl',
    text: 'Follow links across a site or one section, within the page, depth and path limits you set, and read each page on the way. Hosted crawls go up to 500 pages; larger ones run on your computer.',
    painting: 'nature-2', scene: 4,
    window: () => cardWindow({
      url: 'docs.example.com/guide/', tag: 'limit 50 · depth 2', label: 'An example of a crawl: each page it read and how',
      lines: [
        line(['k', '✓ '], ['v', '/guide/          '], ['a', '200  Markdown']),
        line(['k', '✓ '], ['v', '/guide/install/  '], ['a', '200  Markdown']),
        line(['k', '✓ '], ['v', '/guide/config/   '], ['a', '200  Markdown']),
        line(['w', '× '], ['v', '/guide/old/      '], ['w', '404  not found']),
        line(['k', '✓ '], ['v', '/guide/faq/      '], ['a', '200  Markdown']),
        line(['p', '']),
        line(['k', 'completed '], ['a', '· 4 read · 1 failed']),
      ],
    }),
  },
  {
    key: 'batch', hosted: true, title: 'Scrape a batch.', where: 'Hosted with an account · Your computer', glyph: '≡', chip: 'Batch',
    text: 'Hand over a list of URLs and get one result for each, failures included, so no page goes missing quietly. Hosted batches take up to 1,000 URLs.',
    painting: 'sky-1', scene: 0,
    window: () => cardWindow({
      url: 'results/', tag: '3 URLs', label: 'An example of a batch: one result per URL, and the reports',
      lines: [
        line(['k', '✓ '], ['v', '0001-example.com.md']),
        line(['k', '✓ '], ['v', '0002-example.org.md']),
        line(['w', '× '], ['v', '0003-shop.example  '], ['w', 'blocked by robots.txt']),
        line(['p', '']),
        line(['a', 'report.json  results.csv  results.jsonl']),
      ],
    }),
  },
  {
    key: 'actions', hosted: false, title: 'Act in a browser.', where: 'Your computer', glyph: '›', chip: 'Browser actions',
    text: 'Click and scroll before reading, so what sits behind a button or further down a long list comes back too. It runs in Chromium on your computer.',
    painting: 'nature-3', scene: 5,
    window: () => cardWindow({
      url: 'shop.example/catalog', tag: '3 actions', label: 'An example of browser actions run before a read',
      lines: [
        line(['k', '→ click   '], ['v', 'button "Load more"']),
        line(['k', '→ scroll  '], ['v', 'to the end, 3 times']),
        line(['k', '✓ read    '], ['v', '48 items'], ['a', ' · Markdown and a list']),
      ],
    }),
  },
  {
    key: 'monitor', hosted: false, title: 'Monitor a page.', where: 'Your computer', glyph: '◷', chip: 'Monitor',
    text: 'Read a page again on a schedule and send each change to your HTTPS webhook, signed when you give it a secret. Timed runs come from the repository’s local service.',
    painting: 'sky-2', scene: 1,
    window: () => cardWindow({
      url: 'pricing.example/plans', tag: 'every 6 h', label: 'An example of a monitor: two runs, and the change sent to a webhook',
      lines: [
        line(['a', '09:00  '], ['v', 'unchanged']),
        line(['a', '15:00  '], ['k', 'changed']),
        line(['p', '       '], ['k', '→ POST '], ['v', 'https://you.example/hook'], ['a', '  signed']),
      ],
    }),
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
export function startMarkup(): string {
  return `<section class="start-section" id="get-started" aria-labelledby="start-title">
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
/** What it does: a banner of light drawn in characters over a dark curve, naming the six, then the six themselves, the
 * words on the left and a card on the right that the next one slides over as the reader scrolls. The banner and the
 * stage are /scrape/'s (formatsStage.css, product/scrapeFormats.ts); the words and the cards are the home page's. */
export function capabilitiesMarkup(): string {
  const items = CAPABILITIES.map((c, i) => `
              <li class="fx-item${i ? '' : ' is-active'}" data-step="${i}" data-hosted="${c.hosted}"><h3 class="fx-head"><button type="button" data-step="${i}" aria-controls="fx-card-${c.key}">${c.title}</button></h3><div class="fx-body"><p class="fx-eyebrow">${c.where}</p><p>${c.text}</p></div></li>`).join('')
  const cards = CAPABILITIES.map((c, i) => `
              <div class="fx-card is-${c.painting}${i ? '' : ' is-active'}" id="fx-card-${c.key}" data-step="${i}" data-scene="${c.scene}">
              ${c.window()}
              </div>`).join('')
  return `<section class="fx-section is-home" id="what-it-does" aria-labelledby="can-title">
      <div class="band">
        <div class="frame">
          <div class="fx-banner">
            <div class="fx-light" aria-hidden="true"></div>
            <div class="fx-copy">
              <p class="fx-kicker">What it does</p>
              <h2 id="can-title">From one page to a whole site. <span>One tool.</span></h2>
              <p class="fx-lead">Scrape a page, map a site, crawl a section or watch it for changes, all through one API. No crawler to build, no HTML to clean.</p>
              <ul class="fx-formats" aria-label="What Octocrawl does">${CAPABILITIES.map(c => `<li><span class="fx-glyph" aria-hidden="true">${esc(c.glyph)}</span>${c.chip}</li>`).join('')}</ul>
            </div>
          </div>
          <div class="fx-scroll">
            <div class="fx-stage">
              <ol class="fx-list">${items}
              </ol>
              <div class="fx-stack">${cards}
              </div>
            </div>
          </div>
          <p class="fx-note">The first window is a recorded read of the Python docs (17 Oct 2026). The others show what each one returns, on example addresses.</p>
        </div>
      </div>
    </section>`
}
