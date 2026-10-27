/**
 * The hosted parity board's manifest (ROADMAP current phase, stage H item 1; decision 17 in
 * docs/pa-enhancement-tasks.md): where hosted Octocrawl stands against a server on the person's computer, for every
 * local MCP tool and every option of scrape, map, crawl and batch_scrape, and for the option values hosted leaves out.
 * Agents reach Octocrawl through MCP, so an entry describes what the hosted MCP endpoint lists and serves; a REST-only
 * difference is said in its note. Every cap a note names is read from the code or the hosted schemas.
 *
 * hostedParity.test.ts holds the manifest to the code: a local tool, option or left-out value without an entry fails,
 * and so does an entry that claims more than hostedTools(), the hosted key sets and the hosted engine serve, or a
 * refusal hosted no longer makes. The table under "Hosted and local, side by side" in docs/hosted-api.md is
 * parityTable()'s output, checked by the same test: `node --import tsx scripts/hosted/parity-table.ts --write` rewrites it.
 */
import { HOSTED_MAP_MAX_LIMIT, HOSTED_MAP_MAX_TIMEOUT_MS, MAX_FILE_BYTES_CEILING, MAX_MAP_LIMIT, MAX_MAP_TIMEOUT_MS } from '@w2l/contracts'
import { HOSTED_MAX_FILE_BYTES, HOSTED_MCP_SCRAPE_MAX_TIMEOUT_MS, HOSTED_MCP_SCRAPE_TIMEOUT_MS, HOSTED_RECORD_TTL_MS, HOSTED_REQUEST_TIMEOUT_MS, hostedTools } from './hostedApi.js'
import { CREDITS } from './hostedCredits.js'
import { JOB_DEFAULT_CRAWL_PAGES, JOB_MAX_CRAWL_PAGES, JOB_WORKER_COUNT } from './hostedJobRoutes.js'
import { JOB_RETENTION_DAYS } from './hostedJobs.js'
import { MCP_SCRAPE_TIMEOUT_MS, TOOLS, type ToolName } from './tools.js'

/**
 * supported: as on the local server. limited: listed with a lower cap, or to some connections only (a key, the browser
 * lane, an account). planned: not served yet, `item` naming the stage-H item that brings it, null while none does.
 * different_on_purpose: never served, for the reason given.
 */
export type HostedStatus = 'supported' | 'limited' | 'planned' | 'different_on_purpose'

/** The items of stage H (ROADMAP, "Current phase: local first, then hosted parity") that close a gap; PH's own H0–H5 are other stages. */
export const STAGE_H_ITEMS = {
  hosted_access: 'item 2, hosted access',
  actions: 'item 3, actions and waitFor',
  monitors_delivery: 'item 4, monitors and delivery',
  identity: 'item 5, identity-bound features',
  limits_capacity: 'item 6, limits and capacity',
  model_fallback: 'item 7, the json model fallback',
  beyond_local: 'item 8, beyond local',
} as const
export type StageHItem = keyof typeof STAGE_H_ITEMS

/**
 * What hosted does with an option or value it does not list, or a value past its limit, when a caller sends it anyway:
 * refuses the call by name (`refused`), takes it and cannot honour it (`not_honoured`), serves it over REST alone
 * (`rest_only`), or starts the job and fails it at its first slice without naming it (`fails_job`).
 */
export type WhenSent = 'refused' | 'not_honoured' | 'rest_only' | 'fails_job'

/** A limited entry may name a value past hosted's limit that its schema does not show, and what hosted does with it. */
type Limited = { status: 'limited'; note: string; item?: StageHItem; over?: { value: unknown; sent: WhenSent } }
type Served = { status: 'supported'; note?: string } | Limited
type Unserved = { status: 'planned'; item: StageHItem | null; note: string } | { status: 'different_on_purpose'; note: string }
export type ToolEntry = Served | Unserved
export type OptionEntry = Served | (Unserved & { sent: WhenSent })
/**
 * An option value hosted leaves out on some connection, by `option=value`: an enum value, a format's name, a verify
 * check's type, or `variant.property` of a format object. `listed`: hosted lists it and does not honour it yet.
 */
export type ValueEntry = Limited | (Unserved & { sent: WhenSent; listed?: true })

export const OPTION_TOOLS = ['scrape', 'map', 'crawl', 'batch_scrape'] as const
export type OptionTool = (typeof OPTION_TOOLS)[number]
/** A tool's options, as its local input schema names them. */
type OptionOf<N extends OptionTool> = keyof Extract<(typeof TOOLS)[number], { name: N }>['inputSchema']['properties'] & string
/** crawl and batch_scrape take scrape's formats (tools.ts SHARED_FORMATS; hosted lists scrape's own): its value entries are theirs. */
export const SHARED_WITH_SCRAPE: readonly string[] = ['formats']

type Schema = { properties: Record<string, { maximum?: number; maxItems?: number }> }
const schemaOf = (tools: readonly { name: string; inputSchema: unknown }[], name: string) => tools.find((tool) => tool.name === name)?.inputSchema as Schema | undefined
/** An option's maximum in a tool's local schema and in hosted's, for an account's connection with the browser lane. */
const caps = (tool: ToolName, option: string) => ({ local: schemaOf(TOOLS, tool)?.properties[option]?.maximum, hosted: schemaOf(hostedTools(true, true), tool)?.properties[option]?.maximum })
const n = (value: number | undefined) => (value === undefined ? 'none' : value.toLocaleString('en-US'))
const s = (ms: number) => `${(ms / 1000).toLocaleString('en-US')} s`
const mib = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('en-US')} MiB`
const listCaps = (tool: ToolName, options: readonly string[]) => options.map((option) => `${option} at most ${n(caps(tool, option).hosted)} (local ${n(caps(tool, option).local)})`).join(', ')

const PERSON_CHROME = 'Reads or hands over the page in the person\'s own Chrome. Hosted never drives the person\'s Chrome (ADR 0005); stage H item 5 may forward such calls to their own local server.'
const ROBOTS = 'Hosted fetches from the operator\'s addresses and obeys robots.txt for every URL (ROADMAP Direction).'
const TLS = 'A hosted engine never loosens certificate checks for a caller (engine.ts checkHostedOptions).'
const ACCESS = 'Hosted reads no access grant: its ladder is HTTP, then the Playwright browser for a connection with the browser lane. compatible_transport is granted per request by an operator switch, off by default (hostedConfig/compatibleTransport), on the hosts a local server uses it for; the live service\'s state is not checked here. Stage H item 2 goes on with a real Chrome rung on Octocrawl\'s servers, then CAPTCHA solving behind a switch.'
const NO_CACHE = 'Hosted keeps no page cache (storeInCache is pinned off); stage H item 8 plans one shared across users.'
const JOB = 'An account\'s connection only (its key, or signing in at /mcp-oauth)'
const LOGINS = 'Hosted keeps no saved logins. Stage H item 5: Howard chooses between a hosted, encrypted session store and forwarding these calls to the person\'s own local server.'
const MONITORS = 'Monitors run on a server on the person\'s computer; stage H item 4 brings them to hosted.'
const DELIVERY = 'Webhook destinations for Monitors and jobs are a local server\'s; stage H item 4 brings them to hosted. A hosted job\'s end can already be posted over REST (POST /v1/crawl, POST /v1/batches).'
const SCREENSHOT = `A connection with the browser lane only, at ${CREDITS.browserPage} credits a page; an account with fewer credits reads over HTTP alone, where a screenshot is refused.`
const REGEX = 'ADR 0006: a JavaScript regular expression cannot be bounded in time, so hosted refuses it until a time-bounded regular-expression engine exists; markdownIncludes and the structured checks are served.'
const FILE_CAP = `At most ${mib(HOSTED_MAX_FILE_BYTES)} (local ${mib(MAX_FILE_BYTES_CEILING)}).`
const BROWSER_LANE = 'A connection with the browser lane only; one without reads over HTTP alone.'
const WEBHOOK = 'REST takes it for the job\'s end (https, no headers or secretEnv), signed with a secret the start returns; the MCP tool refuses it so the secret stays out of the transcript.'

const monitorTool: ToolEntry = { status: 'planned', item: 'monitors_delivery', note: MONITORS }
const deliveryTool: ToolEntry = { status: 'planned', item: 'monitors_delivery', note: DELIVERY }
const loginTool: ToolEntry = { status: 'planned', item: 'identity', note: LOGINS }
const jobTool = (how = ''): ToolEntry => ({ status: 'limited', note: `${JOB}${how}.` })

export const TOOL_PARITY: Record<ToolName, ToolEntry> = {
  scrape: { status: 'supported', note: 'Every connection. Results leave out usage and channelsTried unless debug is set, and metadata.scrapeId unless debug is set or the connection lists get_scrape (an account\'s); the Evidence Record stays whole.' },
  map: { status: 'supported', note: 'Every connection.' },
  get_scrape: jobTool(`; hosted keeps a scrape's record ${HOSTED_RECORD_TTL_MS / 60_000} minutes, on the server instance that ran the scrape, so a read that reaches another instance answers not_found, and answers it without the call's telemetry, as a scrape's result (locally records are kept without a time limit and answered whole)`),
  crawl: jobTool(`: a job run a slice at a time, at most ${n(JOB_MAX_CRAWL_PAGES)} pages, each page priced as a scrape, results kept ${JOB_RETENTION_DAYS} days`),
  get_crawl: jobTool(', for its own jobs'),
  wait_crawl: jobTool(),
  get_crawl_pages: jobTool(`; ${listCaps('get_crawl_pages', ['limit', 'maxResults'])}`),
  get_crawl_errors: jobTool(`; ${listCaps('get_crawl_errors', ['limit'])}`),
  cancel_crawl: jobTool(),
  resume_crawl: { status: 'planned', item: null, note: 'A hosted job goes on slice by slice by itself; a failed or cancelled one is started again, not resumed.' },
  list_active_crawls: jobTool(': its crawl jobs queued or running, in their job statuses and without the options each was started with (REST GET /v1/crawl/active)'),
  batch_scrape: jobTool(`: a job run a slice at a time, up to ${n(schemaOf(TOOLS, 'batch_scrape')?.properties.urls?.maxItems)} URLs, each page priced as a scrape, results kept ${JOB_RETENTION_DAYS} days`),
  get_batch: jobTool(', for its own jobs'),
  get_batch_items: jobTool(`; ${listCaps('get_batch_items', ['limit', 'maxResults'])}`),
  wait_batch: jobTool(),
  cancel_batch: jobTool(),
  get_batch_errors: jobTool(`; answers the failed items as { items, nextCursor, hasMore } (local { errors, robotsBlocked }), ${listCaps('get_batch_errors', ['limit'])}`),
  hand_off_batch: { status: 'different_on_purpose', note: PERSON_CHROME },
  scrape_product: { status: 'limited', note: 'A key or a signed-in connection with the browser lane only.' },
  batch_products: { status: 'planned', item: null, note: 'Not listed; more Amazon.sg work is paused (ROADMAP Paused).' },
  import_login: loginTool,
  list_logins: loginTool,
  remove_login: loginTool,
  preview_monitor: monitorTool,
  create_monitor: monitorTool,
  list_monitors: monitorTool,
  get_monitor: monitorTool,
  run_monitor: monitorTool,
  get_monitor_run: monitorTool,
  pause_monitor: monitorTool,
  resume_monitor: monitorTool,
  cancel_monitor_run: monitorTool,
  create_delivery_destination: deliveryTool,
  list_delivery_destinations: deliveryTool,
  pause_delivery_destination: deliveryTool,
  resume_delivery_destination: deliveryTool,
  list_deliveries: deliveryTool,
  get_delivery: deliveryTool,
  retry_dead_letter: deliveryTool,
}

const supported: OptionEntry = { status: 'supported' }
const cacheOption = (sent: WhenSent, how = ''): OptionEntry => ({ status: 'planned', item: 'beyond_local', note: `${NO_CACHE}${how}`, sent })
/** The page options scrape, crawl and batch_scrape share, as hosted serves them on a scrape. */
const SCRAPE_PAGE_OPTIONS = {
  onlyMainContent: supported,
  waitFor: { status: 'limited', note: BROWSER_LANE },
  timeout: { status: 'limited', note: `At most ${s(HOSTED_MCP_SCRAPE_MAX_TIMEOUT_MS)}, and ${s(HOSTED_MCP_SCRAPE_TIMEOUT_MS)} when left out (local ${s(caps('scrape', 'timeout').local ?? 0)}, and ${s(MCP_SCRAPE_TIMEOUT_MS)} when left out): 60 s inside the 240 s claude.ai gives a tool call, under Cloud Run's ${s(HOSTED_REQUEST_TIMEOUT_MS)} request timeout.` },
  maxFileBytes: { status: 'limited', note: FILE_CAP },
  includeTags: supported,
  excludeTags: supported,
  headers: supported,
  mobile: supported,
  skipTlsVerification: { status: 'different_on_purpose', note: TLS, sent: 'refused' },
  fastMode: supported,
  blockAds: supported,
  removeBase64Images: supported,
  verify: supported,
  maxAge: cacheOption('not_honoured', ' Taken, and always read live.'),
  minAge: cacheOption('not_honoured', ' Taken, and always read live.'),
  storeInCache: cacheOption('not_honoured', ' Taken, and nothing is stored.'),
  lockdown: cacheOption('not_honoured', ' Taken, and always failed/cache_miss.'),
} as const satisfies Record<string, OptionEntry>
/** A job's page options: its timeout is the local one, and a field the start refuses is refused by name (hostedJobRoutes.ts). */
const JOB_PAGE_OPTIONS = {
  ...SCRAPE_PAGE_OPTIONS,
  timeout: supported,
  maxAge: cacheOption('refused'),
  minAge: cacheOption('refused'),
  storeInCache: cacheOption('refused'),
  lockdown: cacheOption('refused'),
} as const satisfies Record<string, OptionEntry>

export const OPTION_PARITY: { [N in OptionTool]: Record<OptionOf<N>, OptionEntry> } = {
  scrape: {
    url: supported,
    mode: supported,
    handoff: { status: 'different_on_purpose', note: PERSON_CHROME, sent: 'refused' },
    lane: { status: 'different_on_purpose', note: PERSON_CHROME, sent: 'refused' },
    access: { status: 'planned', item: 'hosted_access', note: `${ACCESS} access standard, the default, is taken; enhanced and my-browser are refused by name.`, sent: 'refused' },
    allowlistedDomains: supported,
    formats: supported,
    includeLinks: supported,
    debug: supported,
    ...SCRAPE_PAGE_OPTIONS,
    actions: { status: 'planned', item: 'actions', note: 'A step runs the caller\'s clicks and scripts in the operator\'s browser; hosted takes none until that isolation is reviewed, and stage H item 3 brings actions to keyed callers.', sent: 'refused' },
    robotsOverride: { status: 'different_on_purpose', note: ROBOTS, sent: 'refused' },
    integration: supported,
  },
  map: {
    url: supported,
    search: supported,
    sitemap: supported,
    includeSubdomains: supported,
    ignoreQueryParameters: supported,
    limit: { status: 'limited', item: 'limits_capacity', note: `At most ${n(HOSTED_MAP_MAX_LIMIT)} links (local ${n(MAX_MAP_LIMIT)}).` },
    timeout: { status: 'limited', item: 'limits_capacity', note: `At most ${s(HOSTED_MAP_MAX_TIMEOUT_MS)} (local ${s(MAX_MAP_TIMEOUT_MS)}).` },
    includePaths: supported,
    excludePaths: supported,
    regexOnFullURL: supported,
    crawlEntireDomain: supported,
    deduplicateSimilarURLs: supported,
    ignoreRobotsTxt: { status: 'different_on_purpose', note: ROBOTS, sent: 'refused' },
    mode: supported,
    debug: supported,
    integration: supported,
  },
  crawl: {
    url: supported,
    mode: supported,
    access: { status: 'planned', item: 'hosted_access', note: ACCESS, sent: 'refused' },
    maxPages: { status: 'limited', item: 'limits_capacity', note: `At most ${n(JOB_MAX_CRAWL_PAGES)}, and ${n(JOB_DEFAULT_CRAWL_PAGES)} when left out or null (locally null is no cap).` },
    maxDepth: supported,
    useCached: cacheOption('refused'),
    allowlistedDomains: supported,
    formats: supported,
    includeLinks: supported,
    includePaths: supported,
    excludePaths: supported,
    regexOnFullURL: supported,
    ignoreQueryParameters: supported,
    deduplicateSimilarURLs: supported,
    crawlEntireDomain: supported,
    allowSubdomains: supported,
    allowExternalLinks: supported,
    sitemap: supported,
    ignoreRobotsTxt: { status: 'different_on_purpose', note: ROBOTS, sent: 'refused' },
    maxConcurrency: { status: 'limited', item: 'limits_capacity', note: `At most ${JOB_WORKER_COUNT}, the pages a job's slice reads at once (local: up to the server's worker count, W2L_WORKER_COUNT); the start lowers a larger value to ${JOB_WORKER_COUNT}.`, over: { value: JOB_WORKER_COUNT + 1, sent: 'not_honoured' } },
    idempotencyKey: supported,
    webhook: { status: 'planned', item: 'monitors_delivery', note: WEBHOOK, sent: 'rest_only' },
    ...JOB_PAGE_OPTIONS,
    integration: supported,
  },
  batch_scrape: {
    urls: supported,
    mode: supported,
    lane: { status: 'different_on_purpose', note: PERSON_CHROME, sent: 'refused' },
    access: { status: 'planned', item: 'hosted_access', note: ACCESS, sent: 'refused' },
    formats: supported,
    includeLinks: supported,
    ...JOB_PAGE_OPTIONS,
    actions: { status: 'planned', item: 'actions', note: 'Hosted takes no page actions yet; stage H item 3 brings them to keyed callers.', sent: 'refused' },
    robotsOverrides: { status: 'different_on_purpose', note: ROBOTS, sent: 'refused' },
    maxConcurrency: { status: 'limited', item: 'limits_capacity', note: `Lowered to ${JOB_WORKER_COUNT}, the pages a job's slice reads at once, though the schema offers ${n(caps('batch_scrape', 'maxConcurrency').hosted)} as locally.`, over: { value: caps('batch_scrape', 'maxConcurrency').hosted, sent: 'not_honoured' } },
    ignoreInvalidURLs: supported,
    allowExternalLinks: { status: 'planned', item: null, note: 'Locally only false is taken, since a batch follows no link; hosted refuses the field by name.', sent: 'refused' },
    includeSubdomains: { status: 'planned', item: null, note: 'Locally only false is taken, since a batch follows no link; hosted refuses the field by name.', sent: 'refused' },
    idempotencyKey: supported,
    appendToId: { status: 'planned', item: null, note: 'A hosted batch\'s URLs are fixed when it starts.', sent: 'refused' },
    webhook: { status: 'planned', item: 'monitors_delivery', note: WEBHOOK, sent: 'rest_only' },
    integration: supported,
  },
}

/** Options hosted lists that the local tool has not: what hosted adds. */
export const HOSTED_ONLY_OPTIONS: Partial<Record<OptionTool, Record<string, string>>> = {
  crawl: { maxCredits: 'The most credits the job may spend; it stops when the next page would pass it.' },
  batch_scrape: { maxCredits: 'The most credits the job may spend; it stops when the next page would pass it.' },
}

const MODEL_FALLBACK = 'Listed, and answered as switched off until the model fallback is deployed with a model and switched on (hostedConfig/model); the live service\'s state is not checked here.'
/** crawl's and batch_scrape's formats values are scrape's (SHARED_WITH_SCRAPE), entries included. */
export const VALUE_PARITY: Record<OptionTool, Record<string, ValueEntry>> = {
  scrape: {
    'mode=authed': { status: 'planned', item: 'identity', note: 'Hosted holds no saved logins: the schema leaves the value out, and REST reads such a page anonymously.', sent: 'not_honoured' },
    'access=my-browser': { status: 'different_on_purpose', note: PERSON_CHROME, sent: 'refused' },
    'formats=screenshot': { status: 'limited', note: SCREENSHOT },
    'formats=screenshot@fullPage': { status: 'limited', note: SCREENSHOT },
    'formats=json.modelFallback': { status: 'planned', item: 'model_fallback', note: MODEL_FALLBACK, sent: 'not_honoured', listed: true },
    'verify=markdownMatches': { status: 'planned', item: null, note: REGEX, sent: 'refused' },
    'verify=markdownCountMin': { status: 'planned', item: null, note: REGEX, sent: 'refused' },
  },
  map: {},
  crawl: {
    'verify=markdownMatches': { status: 'planned', item: null, note: REGEX, sent: 'refused' },
    'verify=markdownCountMin': { status: 'planned', item: null, note: REGEX, sent: 'refused' },
  },
  batch_scrape: {
    'mode=authed': { status: 'planned', item: 'identity', note: 'Hosted holds no saved logins; the start refuses the value by name.', sent: 'refused' },
    'access=my-browser': { status: 'different_on_purpose', note: PERSON_CHROME, sent: 'refused' },
    'verify=markdownMatches': { status: 'planned', item: null, note: REGEX, sent: 'refused' },
    'verify=markdownCountMin': { status: 'planned', item: null, note: REGEX, sent: 'refused' },
  },
}

/** The entry for a value of a tool's option: its own, or scrape's for an option crawl and batch_scrape share with it. */
export function valueEntry(tool: OptionTool, option: string, value: string): ValueEntry | undefined {
  return VALUE_PARITY[tool][`${option}=${value}`] ?? (tool !== 'scrape' && SHARED_WITH_SCRAPE.includes(option) ? VALUE_PARITY.scrape[`${option}=${value}`] : undefined)
}

const STATUS_TEXT: Record<HostedStatus, string> = { supported: 'Supported', limited: 'Limited', planned: 'Planned', different_on_purpose: 'Different on purpose' }
const SENT_TEXT: Record<WhenSent, string> = { refused: 'refused by name', not_honoured: 'taken, not honoured', rest_only: 'served over REST only', fails_job: 'the job starts and fails' }

function statusText(entry: ToolEntry | OptionEntry | ValueEntry): string {
  return entry.status === 'planned' ? `Planned: ${entry.item === null ? 'no stage H item yet' : `stage H ${STAGE_H_ITEMS[entry.item]}`}` : STATUS_TEXT[entry.status]
}
function howText(entry: ToolEntry | OptionEntry | ValueEntry): string {
  const raised = entry.status === 'limited' && entry.item !== undefined ? ` Stage H ${STAGE_H_ITEMS[entry.item]} raises it.` : ''
  const sent = 'sent' in entry ? ` Sent anyway: ${SENT_TEXT[entry.sent]}.` : ''
  return `${entry.note ?? ''}${raised}${sent}`.trim()
}
const row = (cells: readonly string[]) => `| ${cells.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`
function count<T extends { status: HostedStatus }>(entries: readonly T[]) {
  const by = (status: HostedStatus) => entries.filter((entry) => entry.status === status).length
  return { all: entries.length, supported: by('supported'), limited: by('limited'), planned: by('planned'), different: by('different_on_purpose') }
}

/** The "Hosted and local, side by side" section's body in docs/hosted-api.md, from this manifest alone. */
export function parityTable(): string {
  const tools = Object.entries(TOOL_PARITY) as [ToolName, ToolEntry][]
  const options = OPTION_TOOLS.flatMap((tool) => (Object.entries(OPTION_PARITY[tool]) as [string, OptionEntry][]).map(([option, entry]) => ({ tool, option, entry })))
  const values = OPTION_TOOLS.flatMap((tool) => Object.entries(VALUE_PARITY[tool]).map(([key, entry]) => ({ tool, key, entry })))
  const t = count(tools.map(([, entry]) => entry))
  const o = count(options.map(({ entry }) => entry))
  const planned = [...tools.map(([, entry]) => entry), ...options.map(({ entry }) => entry), ...values.map(({ entry }) => entry)]
    .flatMap((entry) => entry.status === 'planned' ? [entry.item] : [])
  const byItem = [...Object.keys(STAGE_H_ITEMS) as StageHItem[], null].map((item) => [item, planned.filter((entry) => entry === item).length] as const).filter(([, total]) => total > 0)
  return [
    `**Tools.** Of the local server's ${t.all} MCP tools, hosted serves ${t.supported + t.limited}: ${t.supported} as locally and ${t.limited} limited. ${t.planned} are planned and ${t.different} ${t.different === 1 ? 'is' : 'are'} different on purpose.`,
    '',
    `**Options.** Of the ${o.all} local options of ${OPTION_TOOLS.slice(0, -1).join(', ')} and ${OPTION_TOOLS.at(-1)}, hosted lists ${o.supported + o.limited}: ${o.supported} as locally and ${o.limited} limited. ${o.planned} are planned and ${o.different} different on purpose. Below the options, ${values.length} option values that hosted leaves out or limits.`,
    '',
    `**Planned, by stage H item** (tools, options and values): ${byItem.map(([item, total]) => `${item === null ? 'no item yet' : STAGE_H_ITEMS[item]}: ${total}`).join('; ')}.`,
    '',
    row(['Tool', 'Hosted', 'How']),
    row(['---', '---', '---']),
    ...tools.map(([tool, entry]) => row([`\`${tool}\``, statusText(entry), howText(entry)])),
    '',
    row(['Option', 'Hosted', 'How']),
    row(['---', '---', '---']),
    ...options.map(({ tool, option, entry }) => row([`\`${tool}\` \`${option}\``, statusText(entry), howText(entry)])),
    ...values.map(({ tool, key, entry }) => row([`\`${tool}\` \`${key.replace('=', ': ')}\``, statusText(entry), `${howText(entry)}${tool === 'scrape' && SHARED_WITH_SCRAPE.includes(key.split('=')[0]!) ? ' The same on crawl and batch_scrape.' : ''}`])),
  ].join('\n')
}
