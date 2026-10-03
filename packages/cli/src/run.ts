/**
 * `w2l`: the API's engine on the command line, in this process. scrape and
 * map answer at once; crawl and batch run to the end and answer with their
 * report and every page; serve runs the API itself. A one-off command does
 * not resume the task root's unfinished jobs (`resumeOnStart: false`).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createApiEngine, parseListen, runApiServer, type ApiEngine } from '@w2l/api'
import {
  CONTENTFUL_STATUS,
  parseBatchStartRequest,
  parseCrawlStartRequest,
  parseMapRequest,
  parseScrapeRequest,
  RequestError,
  type CrawlPage,
  type CrawlReport,
  type PageTable,
} from '@w2l/contracts'
import { COMMANDS, parseCommandLine, UsageError, usage, type Command, type CliOptions } from './flags.js'

export const CLI_VERSION = '0.3.0'

export interface CliIo {
  env: NodeJS.ProcessEnv
  stdout: (text: string) => void
  stderr: (text: string) => void
  /** Aborted to stop a running crawl or batch (SIGINT): the job stays paused and resumable. */
  signal?: AbortSignal
}

/** Exit codes: 0 a contentful page or a completed job, 1 anything else W2L answered, 2 a refused command line, 130 interrupted. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const [name, ...rest] = argv
  if (name === undefined || name === '--help' || name === 'help') {
    io.stdout(usage(null))
    return name === undefined ? 2 : 0
  }
  if (name === '--version') { io.stdout(CLI_VERSION); return 0 }
  if (name === 'serve') return serve(rest, io)
  if (!(COMMANDS as readonly string[]).includes(name)) {
    io.stderr(`w2l: unknown command ${name}\n\n${usage(null)}`)
    return 2
  }
  const command = name as Command
  try {
    const line = parseCommandLine(command, rest)
    if (line.cli.help) { io.stdout(usage(command)); return 0 }
    if (command === 'batch' && line.cli.urlsFile !== undefined) line.urls.push(...await urlsFrom(line.cli.urlsFile))
    // Apart from the API server's .w2l/api by default: two processes on one task root could run the same job twice.
    const taskRoot = line.cli.taskRoot ?? io.env.W2L_TASK_ROOT ?? '.w2l/cli'
    const listen = parseListen([], io.env)
    for (const notice of listen.notices) io.stderr(`w2l: ${notice}`)
    const engine = createApiEngine({
      taskRoot,
      networkPolicy: listen.networkPolicy,
      allowRobotsOverride: listen.allowRobotsOverride,
      webhookPolicy: { allowHttpLoopback: listen.delivery.allowHttpLoopback },
      workerCount: listen.workerCount,
      resumeOnStart: false,
    })
    try {
      return await runCommand(engine, command, line.urls, line.body, line.cli, io)
    } catch (error) {
      // Ctrl-C during a scrape or a map: the engine gave up the call; nothing is left to resume.
      if (io.signal?.aborted && !(error instanceof UsageError) && !(error instanceof RequestError)) {
        io.stderr(`w2l ${command}: interrupted`)
        return 130
      }
      throw error
    } finally {
      await engine.close({ cancelActive: true })
    }
  } catch (error) {
    if (error instanceof UsageError || error instanceof RequestError) {
      io.stderr(`w2l ${command}: ${error.message}`)
      return 2
    }
    throw error
  }
}

const ORIGIN = `cli@${CLI_VERSION}`

async function runCommand(engine: ApiEngine, command: Command, urls: string[], body: Record<string, unknown>, cli: CliOptions, io: CliIo): Promise<number> {
  const one = (): string => {
    if (urls.length !== 1) throw new UsageError(`w2l ${command} takes one URL, got ${urls.length}`)
    return urls[0]!
  }
  switch (command) {
    case 'scrape': {
      const req = parseScrapeRequest({ debug: false, ...body, url: one(), origin: ORIGIN })
      const response = await engine.scrape(req, io.signal === undefined ? {} : { signal: io.signal })
      if (cli.out !== undefined) await writeOut(cli.out, [response], null, io)
      if (cli.markdown) io.stdout(response.markdown ?? '')
      else if (cli.out === undefined) io.stdout(JSON.stringify(response, null, 2))
      return CONTENTFUL_STATUS.has(response.status) ? 0 : 1
    }
    case 'map': {
      const response = await engine.map(parseMapRequest({ ...body, url: one(), origin: ORIGIN }), io.signal === undefined ? {} : { signal: io.signal })
      io.stdout(JSON.stringify(response, null, 2))
      return response.status === 'failed' ? 1 : 0
    }
    case 'crawl': {
      let taskId: string
      if (cli.resume !== undefined) {
        if (urls.length > 0) throw new UsageError('w2l crawl --resume takes the task id, not a URL')
        // A crawl recorded as pending or running may be another process's (an API server on this task root): resuming it here would run it twice.
        const current = await engine.getCrawl(cli.resume)
        if (current !== null && (current.status === 'pending' || current.status === 'running')) {
          throw new UsageError(`crawl ${cli.resume} is ${current.status}: another process may be running it. If none is, w2l serve on this task root resumes it`)
        }
        const accepted = await engine.resumeCrawl(cli.resume)
        if (accepted === null) throw new UsageError(`no crawl ${cli.resume} under this task root`)
        taskId = accepted.taskId
      } else {
        taskId = (await engine.startCrawl(parseCrawlStartRequest({ ...body, url: one(), origin: ORIGIN }))).taskId
      }
      io.stderr(`w2l crawl: task ${taskId}`)
      return finish(engine, 'crawl', taskId, cli, io)
    }
    case 'batch': {
      if (urls.length === 0) throw new UsageError('w2l batch takes URLs as arguments or --urls-file')
      const accepted = await engine.startBatch(parseBatchStartRequest({ ...body, urls, origin: ORIGIN }))
      io.stderr(`w2l batch: task ${accepted.taskId}${accepted.invalidURLs?.length ? `, ${accepted.invalidURLs.length} invalid URLs skipped` : ''}`)
      return finish(engine, 'batch', accepted.taskId, cli, io)
    }
  }
}

/** A page as `--out` writes it: a crawl page or batch item (`url`), or a scrape response (`requestedUrl`). */
type Page = { url?: string; requestedUrl?: string; markdown?: string | null; tables?: readonly PageTable[] }

/** Wait for a crawl or batch to end, then answer with its report and every page it recorded. */
async function finish(engine: ApiEngine, kind: 'crawl' | 'batch', taskId: string, cli: CliOptions, io: CliIo): Promise<number> {
  const report = await settled(engine, kind, taskId, io.signal)
  if (report === null) {
    io.stderr(`w2l ${kind}: interrupted; the task is paused${kind === 'crawl' ? `, and w2l crawl --resume ${taskId} continues it` : ' and resumes when the API starts on this task root'}`)
    return 130
  }
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
  return report.status === 'completed' ? 0 : 1
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
 * `report.json` for a job, and per page `<n>-<slug>.md` with its Markdown and
 * `<n>-<slug>.table-<i>.csv` per table it carries (an omitted table has none).
 */
async function writeOut(dir: string, pages: readonly Page[], report: CrawlReport | null, io: CliIo): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'results.jsonl'), pages.map((page) => JSON.stringify(page)).join('\n') + (pages.length > 0 ? '\n' : ''))
  if (report !== null) await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2))
  let markdowns = 0
  let tables = 0
  for (const [n, page] of pages.entries()) {
    const stem = `${String(n + 1).padStart(4, '0')}-${slug(page.url ?? page.requestedUrl ?? '')}`
    if (typeof page.markdown === 'string') { await writeFile(join(dir, `${stem}.md`), page.markdown); markdowns++ }
    for (const table of page.tables ?? []) {
      if (table.omitted !== undefined) continue
      await writeFile(join(dir, `${stem}.table-${table.tableIndex}.csv`), table.csv)
      tables++
    }
  }
  io.stderr(`w2l: wrote ${pages.length} results, ${markdowns} Markdown files and ${tables} CSV tables to ${dir}`)
}

/** A file-name stem from a URL: host and path, letters, digits, dots and dashes only, at most 80 characters. */
function slug(url: string): string {
  let text = url
  try { const parsed = new URL(url); text = parsed.host + parsed.pathname } catch {}
  return text.replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'page'
}

async function urlsFrom(file: string): Promise<string[]> {
  return (await readFile(file, 'utf8')).split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter((line) => line !== '')
}

async function serve(argv: readonly string[], io: CliIo): Promise<number> {
  if (argv.includes('--help')) {
    io.stdout('usage: w2l serve [--port <n>] [--host <addr>] [--hosted --token <t>] [--rate-limit-per-minute <n>] [--task-root <dir>]\nRuns the local API (as w2l-api does) on --task-root, else W2L_TASK_ROOT, else .w2l/api, until SIGINT.')
    return 0
  }
  // --task-root, as on the other commands; the server reads W2L_TASK_ROOT.
  const rest = [...argv]
  const at = rest.findIndex((arg) => arg === '--task-root' || arg.startsWith('--task-root='))
  let env = io.env
  if (at !== -1) {
    const inline = rest[at]!.includes('=') ? rest[at]!.slice(rest[at]!.indexOf('=') + 1) : undefined
    const value = inline ?? rest[at + 1]
    if (value === undefined || value === '' || value.startsWith('--')) { io.stderr('w2l serve: --task-root takes a directory'); return 2 }
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
