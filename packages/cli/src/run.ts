/**
 * `octocrawl`: the API's engine on the command line, in this process. scrape and
 * map answer at once; crawl and batch run to the end and answer with their
 * report and every page; serve runs the API itself. A one-off command does
 * not resume the task root's unfinished jobs (`resumeOnStart: false`).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createApiEngine, csvField, defaultSessionsFile, evidenceRow, markdownFileName, parseListen, preloadEngineModules, RESULT_FILE_COLUMNS, runApiServer, startCaptchaSolving, type ApiEngine, type HandoffHooks, type ResultPage } from '@w2l/api'
import {
  CONTENTFUL_STATUS,
  parseBatchStartRequest,
  parseCrawlStartRequest,
  parseMapRequest,
  parseScrapeRequest,
  RequestError,
  type CrawlPage,
  type CrawlReport,
  withPoolProxy,
} from '@w2l/contracts'
import { COMMANDS, parseCommandLine, UsageError, usage, type Command, type CliOptions } from './flags.js'
import { login } from './login.js'
import { nativeModuleHelp } from './nativeModule.js'

export const CLI_VERSION = '0.8.11'

export interface CliIo {
  env: NodeJS.ProcessEnv
  stdout: (text: string) => void
  stderr: (text: string) => void
  /** Aborted to stop a running crawl or batch (SIGINT): the job stays paused and resumable. */
  signal?: AbortSignal
  /** stdout is a terminal, so a person is reading the JSON: one line on stderr says what it holds and how to get less. */
  tty?: boolean
}

/** Exit codes: 0 a contentful page or a completed job, 1 anything else W2L answered, 2 a refused command line, 130 interrupted. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    return await dispatch(argv, io)
  } catch (error) {
    const help = nativeModuleHelp(error)
    if (help === null) throw error
    io.stderr(`octocrawl: ${help}`)
    return 1
  }
}

async function dispatch(argv: readonly string[], io: CliIo): Promise<number> {
  const [name, ...rest] = argv
  // No command is a mistake, so its usage goes where errors go; asked for, the usage is the answer.
  if (name === undefined) { io.stderr(usage(null)); return 2 }
  if (name === '--help' || name === 'help') { io.stdout(usage(null)); return 0 }
  if (name === '--version') { io.stdout(CLI_VERSION); return 0 }
  if (name === 'serve') return serve(rest, io)
  if (name === 'login') return login(rest, io)
  if (!(COMMANDS as readonly string[]).includes(name)) {
    io.stderr(`octocrawl: unknown command ${name}\n\n${usage(null)}`)
    return 2
  }
  const command = name as Command
  try {
    const line = parseCommandLine(command, rest)
    if (line.cli.help) { io.stdout(usage(command)); return 0 }
    if (command === 'batch' && line.cli.urlsFile !== undefined) line.urls.push(...await urlsFrom(line.cli.urlsFile))
    // A URL typed without its scheme is the likeliest first mistake: say the URL meant, before the API's own check refuses it.
    if (line.body.ignoreInvalidURLs !== true) for (const url of line.urls) checkUrl(url)
    // Apart from the API server's .w2l/api by default: two processes on one task root could run the same job twice.
    const taskRoot = line.cli.taskRoot ?? io.env.W2L_TASK_ROOT ?? '.w2l/cli'
    // A one-off command listens nowhere: the API server's listen address is not its concern, only the network policy is.
    let listen: ReturnType<typeof parseListen>
    try {
      listen = parseListen([], { ...io.env, W2L_API_HOST: '127.0.0.1' })
      await preloadEngineModules(listen)
    } catch (error) { throw new UsageError(error instanceof Error ? error.message : String(error)) }
    for (const notice of listen.notices) io.stderr(`octocrawl: ${notice}`)
    // The grant's CAPTCHA solver and its exit, the run's every rung leaving through it from the first request (ADR 0005).
    const solver = await startCaptchaSolving(listen.captchaSolver, io.env)
    const engine = createApiEngine({
      taskRoot,
      networkPolicy: solver?.exit == null ? listen.networkPolicy : withPoolProxy(listen.networkPolicy, solver.exit),
      allowRobotsOverride: listen.allowRobotsOverride,
      sessionsFile: defaultSessionsFile(io.env),
      // The CLI runs on the person's machine and answers them alone: a page a check stopped can be handed to them in their Chrome.
      userChrome: {},
      webhookPolicy: { allowHttpLoopback: listen.delivery.allowHttpLoopback },
      workerCount: listen.workerCount,
      resumeOnStart: false,
      accessGrant: listen.accessGrant,
      browserEngine: listen.browserEngine,
      browserIdentity: listen.browserIdentity,
      compatHosts: listen.compatHosts,
      egressProxies: listen.egressProxies,
      egressEchoUrl: listen.egressEchoUrl,
      ...(solver === null ? {} : { captchaSolving: solver.solving }),
    })
    try {
      return await runCommand(engine, command, line.urls, line.body, line.cli, io)
    } catch (error) {
      // Ctrl-C during a scrape or a map: the engine gave up the call; nothing is left to resume.
      if (io.signal?.aborted && !(error instanceof UsageError) && !(error instanceof RequestError)) {
        io.stderr(`octocrawl ${command}: interrupted`)
        return 130
      }
      throw error
    } finally {
      await engine.close({ cancelActive: true })
      await solver?.close()
    }
  } catch (error) {
    if (error instanceof UsageError || error instanceof RequestError) {
      io.stderr(`octocrawl ${command}: ${error.message}`)
      return 2
    }
    throw error
  }
}

const ORIGIN = `cli@${CLI_VERSION}`

/** A URL as typed: one without http(s):// is refused with the URL meant, so the API's "url must be http(s)" is not the first thing a person reads. */
function checkUrl(url: string): void {
  if (/^https?:\/\//i.test(url)) return
  // A host name (IDN letters included), localhost or an IPv4 address, with a port or not, then a path or nothing.
  const host = /^([\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+|localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:[/?#]|$)/iu.exec(url)
  if (host !== null) {
    // A local address is nearly always plain http; anything else is https today.
    const scheme = /^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)/i.test(host[1]!) || host[1]!.toLowerCase().endsWith('.localhost') ? 'http' : 'https'
    throw new UsageError(`"${url}" has no scheme; did you mean ${scheme}://${url}?`)
  }
  throw new UsageError(`"${url}" is not a URL: a URL starts with http:// or https://`)
}

/** What a scrape's result is, when it is not the page asked for: the status, its reason, and the first hint, for the terminal. */
type Verdict = { status: string; failureReason?: string | null; blockReason?: string | null; warnings?: ReadonlyArray<{ code: string; message: string }>; agentHints?: readonly string[] }
export function verdictLine(command: string, response: Verdict): string | null {
  const offPage = response.warnings?.some((warning) => warning.code === 'redirected_off_page') === true
  if (CONTENTFUL_STATUS.has(response.status as never) && !offPage) return null
  const reason = response.failureReason ?? response.blockReason ?? null
  // A verified-empty page was read: it holds nothing to extract, which is not a failure (exit 1 stands, as before).
  const head = offPage && CONTENTFUL_STATUS.has(response.status as never) ? `${response.status}, but the site answered another page`
    : response.status === 'empty_verified' ? 'empty_verified (the page was read and holds nothing to extract)'
    : `${response.status}${reason === null ? '' : ` (${reason})`}`
  // The hint says the next step; without one, a browser that could not start is the next thing to know.
  const hint = response.agentHints?.[0] ?? response.warnings?.find((warning) => warning.code === 'browser_not_installed')?.message
  return `octocrawl ${command}: ${head}${hint === undefined ? '' : `; ${hint}`}`
}

async function runCommand(engine: ApiEngine, command: Command, urls: string[], body: Record<string, unknown>, cli: CliOptions, io: CliIo): Promise<number> {
  const one = (): string => {
    if (urls.length !== 1) throw new UsageError(`takes one URL, got ${urls.length} (octocrawl ${command} --help)`)
    return urls[0]!
  }
  switch (command) {
    case 'scrape': {
      const req = parseScrapeRequest({ debug: false, ...body, url: one(), origin: ORIGIN })
      const response = await engine.scrape(req, io.signal === undefined ? {} : { signal: io.signal }, handoffPrompts('scrape', io))
      if (req.handoff !== undefined && response.handoff !== undefined) {
        const missed = response.warnings?.find((warning) => warning.code === 'handoff_not_through')
        io.stderr(`octocrawl scrape: ${missed?.message ?? 'not handed over'}`)
      }
      if (cli.out !== undefined) await writeOut(cli.out, [response], null, io)
      if (cli.markdown) io.stdout(response.markdown ?? '')
      else if (cli.out === undefined) io.stdout(JSON.stringify(response, null, 2))
      // A result that is not the page says so on stderr in every output mode: the Markdown alone, or a file, would hide it.
      const verdict = verdictLine('scrape', response)
      if (verdict !== null) io.stderr(verdict)
      else if (io.tty === true && !cli.markdown && cli.out === undefined) {
        // The Markdown is counted only when it was asked for: another format alone carries none.
        const formats = (req.formats ?? []).map((format) => typeof format === 'string' ? format : format.type)
        const holds = typeof response.markdown === 'string' ? `${response.markdown.length.toLocaleString('en-US')} characters of Markdown` : `the ${formats.join(', ')} ${formats.length === 1 ? 'format' : 'formats'}`
        io.stderr(`octocrawl scrape: ${response.status} on the ${response.lane} lane; ${holds} in the JSON above (--markdown prints the Markdown alone, --out <dir> writes files)`)
      }
      return CONTENTFUL_STATUS.has(response.status) ? 0 : 1
    }
    case 'map': {
      const response = await engine.map(parseMapRequest({ ...body, url: one(), origin: ORIGIN }), io.signal === undefined ? {} : { signal: io.signal })
      io.stdout(JSON.stringify(response, null, 2))
      const hint = response.agentHints?.[0]
      if (response.status === 'failed') io.stderr(`octocrawl map: failed${hint === undefined ? '' : `; ${hint}`}`)
      else if (io.tty === true) io.stderr(`octocrawl map: ${response.status}, ${response.links.length.toLocaleString('en-US')} URLs in the JSON above${hint === undefined ? '' : `; ${hint}`}`)
      return response.status === 'failed' ? 1 : 0
    }
    case 'crawl': {
      let taskId: string
      if (cli.resume !== undefined) {
        if (urls.length > 0) throw new UsageError('octocrawl crawl --resume takes the task id, not a URL')
        // A crawl recorded as pending or running may be another process's (an API server on this task root): resuming it here would run it twice.
        const current = await engine.getCrawl(cli.resume)
        if (current !== null && (current.status === 'pending' || current.status === 'running')) {
          throw new UsageError(`crawl ${cli.resume} is ${current.status}: another process may be running it. If none is, octocrawl serve on this task root resumes it`)
        }
        const accepted = await engine.resumeCrawl(cli.resume)
        if (accepted === null) throw new UsageError(`no crawl ${cli.resume} under this task root`)
        taskId = accepted.taskId
      } else {
        taskId = (await engine.startCrawl(parseCrawlStartRequest({ ...body, url: one(), origin: ORIGIN }))).taskId
      }
      io.stderr(`octocrawl crawl: task ${taskId}`)
      return finish(engine, 'crawl', taskId, cli, io)
    }
    case 'batch': {
      // --login-walls-of <id> takes its URLs from that batch of this task root (login UX A4): none of its own.
      if (urls.length === 0 && body.loginWallsOf === undefined) throw new UsageError('takes URLs as arguments or --urls-file <file> (octocrawl batch --help)')
      const accepted = await engine.startBatch(parseBatchStartRequest({ ...body, ...(urls.length === 0 ? {} : { urls }), origin: ORIGIN }))
      io.stderr(`octocrawl batch: task ${accepted.taskId}${accepted.invalidURLs?.length ? `, ${accepted.invalidURLs.length} invalid URLs skipped` : ''}`)
      if (body.lane === 'my-browser' || body.access === 'my-browser') io.stderr('octocrawl batch: in your Chrome, click Allow if Chrome asks, then Allow reading these sites in the page Octocrawl opens for the sites of the batch you have not allowed before (none opens when you allowed them all; octocrawl login revoke <site> to forget one); close that page or click Revoke to stop')
      return finish(engine, 'batch', accepted.taskId, cli, io)
    }
  }
}

/** A page as `--out` writes it: a crawl page or batch item (`url`), or a scrape response (`requestedUrl`). */
type Page = ResultPage

/** Wait for a crawl or batch to end, then answer with its report and every page it recorded. */
async function finish(engine: ApiEngine, kind: 'crawl' | 'batch', taskId: string, cli: CliOptions, io: CliIo): Promise<number> {
  let report = await settled(engine, kind, taskId, io.signal)
  if (report === null) {
    io.stderr(`octocrawl ${kind}: interrupted; the task is paused${kind === 'crawl' ? `, and octocrawl crawl --resume ${taskId} continues it` : ' and resumes when the API starts on this task root'}`)
    return 130
  }
  if (kind === 'batch' && cli.handoff === true) report = await handOff(engine, taskId, io) ?? report
  const items: CrawlPage[] = []
  for (let cursor: string | undefined; ;) {
    const page = await engine.listJobPages(taskId, { ...(cursor === undefined ? {} : { cursor }), limit: 50 })
    if (page === null) break
    items.push(...page.items)
    if (!page.hasMore || page.nextCursor === null) break
    cursor = page.nextCursor
  }
  if (cli.out !== undefined) {
    await writeOut(cli.out, items, report, io)
    io.stdout(JSON.stringify(report, null, 2))
  } else {
    io.stdout(JSON.stringify({ report, items }, null, 2))
  }
  io.stderr(summaryLine(kind, report, items, cli.out === undefined))
  return report.status === 'completed' ? 0 : 1
}

/** One line on how the job ended: its status, how many pages were read and how many were not, and where the pages are. */
function summaryLine(kind: 'crawl' | 'batch', report: CrawlReport, items: readonly CrawlPage[], onStdout: boolean): string {
  // A verified-empty page was read, as the batch's own `succeeded` counts it.
  const read = items.filter((item) => CONTENTFUL_STATUS.has(item.status as never) || item.status === 'empty_verified').length
  const notRead = items.length - read
  const offPage = items.filter((item) => item.warnings?.some((warning) => warning.code === 'redirected_off_page')).length
  const signedOut = items.filter((item) => item.warnings?.some((warning) => warning.code === 'sign_in_prompt')).length
  const thin = items.filter((item) => item.warnings?.some((warning) => warning.code === 'thin_page')).length
  const parts = [`${report.status}`, `${read.toLocaleString('en-US')} of ${items.length.toLocaleString('en-US')} pages read`]
  if (notRead > 0) parts.push(`${notRead.toLocaleString('en-US')} not read (each item says why, with its agentHints)`)
  if (offPage > 0) parts.push(`${offPage.toLocaleString('en-US')} answered by another page of the site (redirected_off_page)`)
  if (signedOut > 0) parts.push(`${signedOut.toLocaleString('en-US')} read without your login: sign in again and run them again (sign_in_prompt)`)
  if (thin > 0) parts.push(`${thin.toLocaleString('en-US')} far shorter than the site's other pages (thin_page)`)
  if (onStdout) parts.push('the report and every page are the JSON above (--out <dir> writes them as files)')
  return `octocrawl ${kind}: ${parts.join('; ')}`
}

/** What a handoff tells the person on the terminal while it waits for them. */
function handoffPrompts(command: 'scrape' | 'batch', io: CliIo): HandoffHooks {
  return {
    onWaiting: (url, check) => io.stderr(`octocrawl ${command}: ${url} shows a ${check.replace(/_/g, ' ')}: get through it in the Chrome tab that opened (click Allow if Chrome asks)`),
    onConfirm: (url) => io.stderr(`octocrawl ${command}: ${url} shows no check in your Chrome: click on the page if it is the one to read (Octocrawl reads it only once you act in its tab)`),
    onHidden: (url) => io.stderr(`octocrawl ${command}: the Chrome tab Octocrawl opened for ${url} is not in front: switch to it (clicks in another tab or window are not seen)`),
    onContinue: (url, pages) => io.stderr(`octocrawl ${command}: through: page on in that tab by clicking Next, Octocrawl reads each page as it shows (${pages} read so far); it stops when Next is gone, or after 60 s without a new page`),
    onAllow: (asked, remembered, remember) => io.stderr(`octocrawl ${command}: in your Chrome, click Allow if Chrome asks, ${asked.length === 0
      ? `then nothing more: you allowed ${remembered.join(', ')} before (octocrawl login revoke <site> to stop)`
      : `then Allow reading these sites in the page Octocrawl opened (${asked.join(', ')})${remember ? '; Octocrawl remembers them and does not ask again (octocrawl login revoke <site> to forget one)' : ''}; close that page or click Revoke to stop`}. While remote debugging is on, sites see navigator.webdriver true: turn it off at chrome://inspect/#remote-debugging when you are done`),
    ...(io.signal === undefined ? {} : { signal: io.signal }),
  }
}

/** The batch's items a check stopped, handed to the person in their Chrome; the batch's report after, or null when nothing was handed over. */
async function handOff(engine: ApiEngine, taskId: string, io: CliIo): Promise<CrawlReport | null> {
  const before = await engine.getBatch(taskId)
  const waiting = before?.waitingForPerson ?? 0
  if (waiting === 0) return null
  io.stderr(`octocrawl batch: ${waiting} page${waiting === 1 ? '' : 's'} stopped at a check; opening ${waiting === 1 ? 'it' : 'them'} in your Chrome, one at a time (click Allow if Chrome asks)`)
  try {
    const done = await engine.handOffBatch(taskId, {}, handoffPrompts('batch', io))
    if (done !== null) {
      io.stderr(`octocrawl batch: ${done.through} of ${done.handedOff} read in your Chrome`)
      for (const item of done.items) if (!item.through) io.stderr(`octocrawl batch: ${item.url} not read: ${item.reason ?? 'not through'}`)
    }
  } catch (error) {
    // The batch's results are written whatever became of the handoff.
    io.stderr(`octocrawl batch: no handoff: ${error instanceof Error ? error.message : String(error)}`)
  }
  return engine.getBatch(taskId)
}

async function settled(engine: ApiEngine, kind: 'crawl' | 'batch', taskId: string, signal: AbortSignal | undefined): Promise<CrawlReport | null> {
  for (;;) {
    const report = kind === 'batch' ? await engine.getBatch(taskId) : await engine.getCrawl(taskId)
    if (report !== null && (report.status === 'completed' || report.status === 'failed' || report.status === 'cancelled')) return report
    if (signal?.aborted) return null
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/**
 * `--out <dir>`: `results.jsonl` (one page per line, as answered),
 * `results.csv` (one row per page, its evidence in EVIDENCE_COLUMNS, failed
 * pages included), `report.json` for a job, and per page `<n>-<slug>.md` with
 * its Markdown and `<n>-<slug>.table-<i>.csv` per table it carries (an omitted
 * table has none).
 */
async function writeOut(dir: string, pages: readonly Page[], report: CrawlReport | null, io: CliIo): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'results.jsonl'), pages.map((page) => JSON.stringify(page)).join('\n') + (pages.length > 0 ? '\n' : ''))
  if (report !== null) await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2))
  let markdowns = 0
  let tables = 0
  const rows: string[] = [EVIDENCE_COLUMNS.join(',')]
  for (const [n, page] of pages.entries()) {
    const stem = markdownFileName(n + 1, page.url ?? page.requestedUrl ?? '').replace(/\.md$/, '')
    const markdownFile = typeof page.markdown === 'string' ? `${stem}.md` : null
    if (markdownFile !== null) { await writeFile(join(dir, markdownFile), page.markdown!); markdowns++ }
    rows.push([...evidenceRow(page), markdownFile].map(csvField).join(','))
    for (const table of page.tables ?? []) {
      if (table.omitted !== undefined) continue
      await writeFile(join(dir, `${stem}.table-${table.tableIndex}.csv`), table.csv)
      tables++
    }
  }
  await writeFile(join(dir, 'results.csv'), rows.map((row) => `${row}\r\n`).join(''))
  io.stderr(`octocrawl: wrote ${pages.length} results (results.jsonl, results.csv), ${markdowns} Markdown files and ${tables} CSV tables to ${dir}`)
}

/**
 * The columns of `results.csv`, in order: the same as a server writes when a job ends (RESULT_FILE_COLUMNS, docs/cli.md),
 * the evidence, then the page's Markdown file. A value Octocrawl did not observe is empty, never 0.
 */
export const EVIDENCE_COLUMNS = RESULT_FILE_COLUMNS

async function urlsFrom(file: string): Promise<string[]> {
  return (await readFile(file, 'utf8')).split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter((line) => line !== '')
}

async function serve(argv: readonly string[], io: CliIo): Promise<number> {
  if (argv.includes('--help')) {
    io.stdout('usage: octocrawl serve [--port <n>] [--host <addr>] [--hosted --token <t>] [--rate-limit-per-minute <n>] [--task-root <dir>] [--access-grant <file>]\nRuns the local API (as w2l-api does) on --task-root, else W2L_TASK_ROOT, else .w2l/api, until SIGINT. --access-grant (or W2L_ACCESS_GRANT) names what enhanced access may do (ADR 0005).')
    return 0
  }
  // --task-root, as on the other commands; the server reads W2L_TASK_ROOT.
  const rest = [...argv]
  const at = rest.findIndex((arg) => arg === '--task-root' || arg.startsWith('--task-root='))
  let env = io.env
  if (at !== -1) {
    const inline = rest[at]!.includes('=') ? rest[at]!.slice(rest[at]!.indexOf('=') + 1) : undefined
    const value = inline ?? rest[at + 1]
    if (value === undefined || value === '' || value.startsWith('--')) { io.stderr('octocrawl serve: --task-root takes a directory'); return 2 }
    rest.splice(at, inline === undefined ? 2 : 1)
    env = { ...io.env, W2L_TASK_ROOT: value }
  }
  const server = await runApiServer(rest, env, { signals: false, log: io.stderr })
  await new Promise<void>((resolve) => {
    if (io.signal?.aborted) resolve()
    else io.signal?.addEventListener('abort', () => resolve(), { once: true })
  })
  await server.close()
  return 0
}
