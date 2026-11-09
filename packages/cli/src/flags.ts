/**
 * The command line as an API request. Every flag is an API option under its
 * kebab-case name (`maxAge` is `--max-age`), and the request it builds is
 * checked by the same parser the REST API uses, so a value the API refuses
 * is refused here with the same message. Positional arguments are the URLs.
 */

import { BATCH_KEYS, CRAWL_KEYS, MAP_KEYS, SCRAPE_KEYS } from '@w2l/contracts'

export const COMMANDS = ['scrape', 'crawl', 'batch', 'map'] as const
export type Command = (typeof COMMANDS)[number]

/** How a flag's text becomes the option's value. */
type Kind = 'boolean' | 'int' | 'string' | 'list' | 'repeat' | 'json' | 'formats' | 'parsers' | 'headers' | 'webhook'

const KINDS: Readonly<Record<string, Kind>> = {
  includeLinks: 'boolean', debug: 'boolean', onlyMainContent: 'boolean', mobile: 'boolean', skipTlsVerification: 'boolean', fastMode: 'boolean',
  blockAds: 'boolean', removeBase64Images: 'boolean', storeInCache: 'boolean', lockdown: 'boolean', useCached: 'boolean', ignoreInvalidURLs: 'boolean',
  regexOnFullURL: 'boolean', ignoreQueryParameters: 'boolean', deduplicateSimilarURLs: 'boolean', crawlEntireDomain: 'boolean',
  allowSubdomains: 'boolean', allowExternalLinks: 'boolean', includeSubdomains: 'boolean', handoff: 'boolean', ignoreRobotsTxt: 'boolean', backgroundTabs: 'boolean',
  waitFor: 'int', timeout: 'int', maxFileBytes: 'int', maxAge: 'int', minAge: 'int', maxPages: 'int', maxDepth: 'int', maxConcurrency: 'int', maxCredits: 'int', limit: 'int',
  mode: 'string', lane: 'string', access: 'string', sitemap: 'string', idempotencyKey: 'string', appendToId: 'string', loginWallsOf: 'string', search: 'string', integration: 'string',
  allowlistedDomains: 'list', includeTags: 'list', excludeTags: 'list',
  // A path pattern is a regex and may hold a comma: one per flag.
  includePaths: 'repeat', excludePaths: 'repeat',
  formats: 'formats', parsers: 'parsers', headers: 'headers', webhook: 'webhook',
  robotsOverride: 'json', robotsOverrides: 'json', retry: 'json',
}

/**
 * The URL keys are positional and `origin` is the CLI's own label, so
 * neither is a flag. `webhook` is not offered: a command runs no delivery
 * worker, so its events would wait until an API server opened the task root.
 */
const NOT_FLAGS: ReadonlySet<string> = new Set(['url', 'urls', 'origin', 'webhook'])

/** Options the CLI refuses with the supported route, instead of as unknown. */
const REFUSED_FLAGS: Readonly<Record<string, string>> = {
  webhook: '--webhook is not offered by the command line, which runs no delivery worker: start the API (octocrawl serve) and send the crawl or batch to it',
}

/** The CLI's own flags where a command does not take them: where each belongs. */
const ELSEWHERE: Readonly<Record<string, string>> = {
  markdown: '--markdown prints a scrape\'s Markdown alone; a batch or crawl writes each page\'s Markdown to a file with --out <dir>',
  out: '--out is not taken by map: its answer is the JSON on stdout',
  'urls-file': '--urls-file <file> is a batch flag (octocrawl batch --urls-file <file>): one URL per line',
  resume: '--resume <taskId> is a crawl flag (octocrawl crawl --resume <taskId>); a batch resumes when the API starts on its task root',
}

/** The CLI's own flags, by command, listed in its help beside the API options. */
const CLI_FLAG_LINES: Readonly<Record<Command, readonly string[]>> = {
  scrape: ['  --markdown   print the Markdown alone, nothing else', '  --out <dir>   write results.jsonl, results.csv, the Markdown and each table as CSV there'],
  batch: ['  --urls-file <file>   one URL per line (# comments); beside the URLs on the command line', '  --out <dir>   write results.jsonl, results.csv, report.json, the Markdown and each table as CSV there', '  --handoff   when the batch ends, open each page a check stopped in your own Chrome'],
  crawl: ['  --resume <taskId>   continue a crawl Ctrl-C paused, in place of a URL', '  --out <dir>   write results.jsonl, results.csv, report.json, the Markdown and each table as CSV there'],
  map: [],
}

const KEYS: Readonly<Record<Command, readonly string[]>> = { scrape: SCRAPE_KEYS, crawl: CRAWL_KEYS, batch: BATCH_KEYS, map: MAP_KEYS }

/** The options a command takes as flags, by API name. */
export function optionKeys(command: Command): string[] {
  return KEYS[command].filter((key) => !NOT_FLAGS.has(key))
}

/** `maxAge` → `max-age`, `regexOnFullURL` → `regex-on-full-url`, `ignoreInvalidURLs` → `ignore-invalid-urls`. */
export function flagName(key: string): string {
  // An acronym, plural or not, is one word: URL, URLs.
  const words = key.replace(/([A-Z]+)(s?)(?=[A-Z]|$)/g, (_, acronym: string, plural: string) => acronym[0] + acronym.slice(1).toLowerCase() + plural)
  return words.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/** The CLI's own flags, beside the API options. */
export interface CliOptions {
  /** Write each page's Markdown and each table's CSV under this directory, with `results.jsonl` and `results.csv`. */
  out?: string
  /** scrape: print the Markdown alone. */
  markdown?: boolean
  /** batch: a file of URLs, one per line (`#` starts a comment). */
  urlsFile?: string
  /** batch: when it ends, hand the items a check stopped (a captcha, a challenge, a login wall) to the person in their own Chrome. */
  handoff?: boolean
  /** crawl: resume this crawl (its task id) instead of starting one. */
  resume?: string
  /** The task root (default `W2L_TASK_ROOT`, else `.w2l/api`). */
  taskRoot?: string
  help?: boolean
}

export interface ParsedCommandLine {
  urls: string[]
  /** The API request body, before the API parser checks it. */
  body: Record<string, unknown>
  cli: CliOptions
}

export class UsageError extends Error {
  override readonly name = 'UsageError'
}

const CLI_VALUE_FLAGS: Readonly<Record<string, keyof CliOptions>> = { out: 'out', 'urls-file': 'urlsFile', resume: 'resume', 'task-root': 'taskRoot' }

/** Parse the arguments after the command name. */
export function parseCommandLine(command: Command, argv: readonly string[]): ParsedCommandLine {
  const byFlag = new Map(optionKeys(command).map((key) => [flagName(key), key]))
  const urls: string[] = []
  const body: Record<string, unknown> = {}
  const cli: CliOptions = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (!arg.startsWith('--') || arg === '--') {
      if (arg !== '--') urls.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    let name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
    const inline = eq === -1 ? undefined : arg.slice(eq + 1)
    const value = (): string => {
      if (inline !== undefined) {
        if (inline === '' && name === 'task-root') throw new UsageError('--task-root takes a directory')
        return inline
      }
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) throw new UsageError(`--${name} takes a value`)
      i++
      return next
    }
    if (name === 'help') { cli.help = true; continue }
    if (name === 'markdown' && command === 'scrape') { cli.markdown = true; continue }
    if (name === 'handoff' && command === 'batch') { cli.handoff = true; continue }
    const refused = REFUSED_FLAGS[name]
    if (refused !== undefined && (command === 'crawl' || command === 'batch')) throw new UsageError(refused)
    const cliKey = CLI_VALUE_FLAGS[name]
    if (cliKey !== undefined && (cliKey !== 'urlsFile' || command === 'batch') && (cliKey !== 'resume' || command === 'crawl') && (cliKey !== 'out' || command !== 'map')) {
      (cli as Record<string, unknown>)[cliKey] = value()
      continue
    }
    // `--header name=value`, repeatable, beside `--headers '{"name":"value"}'`.
    if (name === 'header' && byFlag.has('headers')) {
      const text = value()
      const at = text.search(/[:=]/)
      if (at <= 0) throw new UsageError(`--header takes name=value, got ${text}`)
      body.headers = { ...(body.headers as Record<string, string> | undefined), [text.slice(0, at).trim()]: text.slice(at + 1).trim() }
      continue
    }
    let negated = false
    if (!byFlag.has(name) && name.startsWith('no-') && KINDS[byFlag.get(name.slice(3)) ?? ''] === 'boolean') {
      negated = true
      name = name.slice(3)
    }
    const key = byFlag.get(name)
    if (key === undefined) {
      // A flag of another command is sent where it belongs, not called unknown.
      const elsewhere = ELSEWHERE[name]
      throw new UsageError(elsewhere ?? `unknown flag --${name} for octocrawl ${command} (octocrawl ${command} --help lists them)`)
    }
    const kind = KINDS[key] ?? 'json'
    switch (kind) {
      case 'boolean': {
        if (negated) {
          if (inline !== undefined) throw new UsageError(`--no-${name} takes no value`)
          body[key] = false
          break
        }
        if (inline === undefined) { body[key] = true; break }
        if (inline !== 'true' && inline !== 'false') throw new UsageError(`--${name} is true or false, got ${inline}`)
        body[key] = inline === 'true'
        break
      }
      case 'int': {
        const text = value()
        if (!/^-?\d+$/.test(text)) throw new UsageError(`--${name} takes an integer, got ${text}`)
        body[key] = Number(text)
        break
      }
      case 'string':
        body[key] = value()
        break
      case 'list':
        body[key] = [...((body[key] as string[] | undefined) ?? []), ...value().split(',').map((item) => item.trim()).filter((item) => item !== '')]
        break
      case 'repeat':
        body[key] = [...((body[key] as string[] | undefined) ?? []), value()]
        break
      case 'formats': {
        // A comma list of names, or a JSON array for entries with options (a json schema, attributes, a screenshot).
        const text = value().trim()
        const items: unknown[] = text.startsWith('[') ? json(name, text) as unknown[] : text.split(',').map((item) => item.trim()).filter((item) => item !== '')
        body[key] = [...((body[key] as unknown[] | undefined) ?? []), ...(Array.isArray(items) ? items : [items])]
        break
      }
      case 'parsers': {
        // `none` reads no PDF ([]); `pdf` the defaults; JSON for a pdf entry with options.
        const text = value().trim()
        body[key] = text === 'none' ? [] : text.startsWith('[') || text.startsWith('{') ? [json(name, text)].flat() : text.split(',').map((item) => item.trim())
        break
      }
      case 'headers':
        body[key] = { ...(body[key] as Record<string, string> | undefined), ...(json(name, value()) as Record<string, string>) }
        break
      case 'webhook': {
        const text = value().trim()
        body[key] = text.startsWith('{') ? json(name, text) : text
        break
      }
      case 'json':
        body[key] = json(name, value())
        break
    }
  }
  return { urls, body, cli }
}

function json(name: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new UsageError(`--${name} takes JSON, got ${text}`)
  }
}

/** The help text of a command: its synopsis and every flag with the API option it sets. */
export function usage(command: Command | null): string {
  if (command === null) {
    return [
      'usage: octocrawl <command> [options]',
      '',
      '  scrape <url>          one page; JSON on stdout (--markdown for the Markdown alone)',
      '  crawl <url>           follow a site\'s links (--resume <taskId> continues one)',
      '  batch <url>...        many pages (--urls-file <file>)',
      '  map <url>             list a site\'s URLs without fetching each page',
      '  serve                 run the local API (--port, --host, --hosted, --token)',
      '  login import <site>   save your login to a site from the Chrome you use, for --mode authed (octocrawl login --help)',
      '',
      'A page behind your login: --lane my-browser reads it in the Chrome you are signed in to; --mode authed reads it with a login you saved.',
      '',
      'Every option of the REST API is a flag under its kebab-case name: maxAge is --max-age.',
      'octocrawl <command> --help lists them; octocrawl --version prints the version. A command\'s task root is --task-root, else W2L_TASK_ROOT,',
      'else .w2l/cli, apart from the API\'s .w2l/api: never point a command at the task root of a running server.',
    ].join('\n')
  }
  const synopsis: Record<Command, string> = {
    crawl: 'usage: octocrawl crawl <url> [options] [--out <dir>] | octocrawl crawl --resume <taskId>',
    scrape: 'usage: octocrawl scrape <url> [options] [--markdown] [--out <dir>] [--handoff] [--lane my-browser]\n\n--handoff: a page a captcha, a challenge or a login wall stops opens in a new tab of your own Chrome\n(remote debugging on at chrome://inspect/#remote-debugging; click Allow); get through it there and click on the page,\nand Octocrawl answers with it. Octocrawl passes no check itself.\n--lane my-browser: for a page behind your login, or one that needs your address or a real browser: read it in your own Chrome, where\nyou are signed in (remote debugging on, as for --handoff): click Allow in Chrome, then, the first time for a site, Allow reading these sites\nin the page Octocrawl opens there (close it or click Revoke to stop). Octocrawl remembers the site and does not ask again:\noctocrawl login allowed lists them, octocrawl login revoke <site> forgets one.',
    batch: 'usage: octocrawl batch <url>... [--urls-file <file>] [options] [--out <dir>] [--handoff] [--lane my-browser]\n\n--handoff: when the batch ends, each page a captcha, a challenge or a login wall stopped opens in a new tab\nof your own Chrome (remote debugging on at chrome://inspect/#remote-debugging; click Allow once); get through\nit there and Octocrawl reads the page. Octocrawl passes no check itself. A batch with one paginate step (with itemSelector) is handed over too: the page its list\nstopped at opens, you get through the check and page on by clicking Next, and Octocrawl reads each page as it shows.\n--lane my-browser: for a page behind your login, or one that needs your address or a real browser: read every page in your own Chrome,\none at a time, where you are signed in (remote debugging on, as for --handoff): click Allow in Chrome, then Allow\nreading these sites once in the page Octocrawl opens there for the sites you have not allowed before (close it or click Revoke to stop;\noctocrawl login revoke <site> forgets one). Each page opens in a tab behind the one you are on and\nonly a page with a check you must act on comes to the front; --no-background-tabs brings each page\'s tab to the front as it opens.',
    map: 'usage: octocrawl map <url> [options]',
  }
  const lines = optionKeys(command).map((key) => {
    const kind = KINDS[key] ?? 'json'
    const hint: Record<Kind, string> = {
      boolean: '', int: ' <integer>', string: ' <text>', list: ' <a,b,...>', repeat: ' <regex> (repeatable)', json: ' <json>',
      formats: ' <markdown,links,tables,...|json array>', parsers: ' <pdf|none|json>', headers: ' <json> (or --header name=value)', webhook: ' <url|json>',
    }
    return `  --${flagName(key)}${hint[kind]}${kind === 'boolean' ? ` (or --no-${flagName(key)})` : ''}   ${key}`
  })
  return [synopsis[command], '', 'Options (the API option each sets is on the right; the API reference describes them):', ...lines, '', 'The command line\'s own:', ...CLI_FLAG_LINES[command], '  --task-root <dir>   where tasks, files and the page cache live (default W2L_TASK_ROOT, else .w2l/cli)', '  --help'].join('\n')
}
