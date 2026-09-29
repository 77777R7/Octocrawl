/**
 * `w2l crawl <url>` — multi-page composition over the scrape atom.
 *
 * Checkpoint SQLite sits in `--task-dir` (default `.w2l/crawl-<stamp>`).
 * `--resume` continues the latest task there with the options it was started
 * with. `--headed` only reaches BrowserLocalSubject. CI stays headless.
 */

import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CONTENTFUL_STATUS, defaultApiMode, describeEgressProxy, identityBundleFrom, localNetworkPolicy, maxFileBytesFromEnv, modeIdentity, withEnvironmentProxy, withOperatorContact, type CrawlBudget, type Task } from '@w2l/contracts'
import { CHECKPOINT_FILENAME, CrawlOrchestrator, SqliteTaskStore } from '@w2l/runtime'
import type { CrawlPolicy } from '@w2l/http-core'
import { LadderRunner } from './routing/ladder.js'
import { MemoryRoutingHistory } from './routing/vendorRouter.js'
import { buildChannels } from './ladderCli.js'
import { LadderScrapeAtom } from './scrapeAtom.js'
import { FileStore } from './fileStore.js'

export const CRAWL_USAGE =
  'usage: w2l crawl [--research|--authed] [--headed] [--max-pages n] [--max-depth n] [--task-dir d] [--resume [d]] [--use-cached] [--allowlist-hosts a,b] <url>\n' +
  '       w2l crawl --resume <task-dir>'

export interface CrawlArgs {
  url: string | null
  mode: 'standard' | 'research' | 'authed'
  headed: boolean
  maxPages: number | null
  maxDepth: number | null
  taskDir: string | null
  resume: boolean
  useCached: boolean
  allowlistedDomains: string[]
}

function takeValue(arg: string, argv: readonly string[], i: number, name: string): { value: string; next: number } {
  const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[i + 1]
  if (value === undefined || value.startsWith('-')) throw new Error(`${name} needs a value`)
  return { value, next: arg.includes('=') ? i : i + 1 }
}

export function parseCrawlArgs(argv: readonly string[]): CrawlArgs {
  let mode: CrawlArgs['mode'] = 'standard'
  let headed = false
  let maxPages: number | null = null
  let maxDepth: number | null = null
  let taskDir: string | null = null
  let resume = false
  let useCached = false
  let allowlistedDomains: string[] = []
  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--help' || arg === '-h') throw new Error(CRAWL_USAGE)
    if (arg === '--research') mode = 'research'
    else if (arg === '--authed') mode = 'authed'
    else if (arg === '--headed') headed = true
    else if (arg === '--use-cached') useCached = true
    else if (arg === '--resume' || arg.startsWith('--resume=')) {
      resume = true
      if (arg.includes('=') || (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith('-') && !looksLikeUrl(argv[i + 1]!))) {
        const taken = takeValue(arg, argv, i, '--resume')
        taskDir = taken.value
        i = taken.next
      }
    } else if (arg === '--max-pages' || arg.startsWith('--max-pages=')) {
      const taken = takeValue(arg, argv, i, '--max-pages')
      maxPages = Number(taken.value)
      if (!Number.isFinite(maxPages) || maxPages < 1) throw new Error('--max-pages must be a positive integer')
      i = taken.next
    } else if (arg === '--max-depth' || arg.startsWith('--max-depth=')) {
      const taken = takeValue(arg, argv, i, '--max-depth')
      maxDepth = Number(taken.value)
      if (!Number.isFinite(maxDepth) || maxDepth < 0) throw new Error('--max-depth must be >= 0')
      i = taken.next
    } else if (arg === '--task-dir' || arg.startsWith('--task-dir=')) {
      const taken = takeValue(arg, argv, i, '--task-dir')
      taskDir = taken.value
      i = taken.next
    } else if (arg.startsWith('--allowlist-hosts')) {
      const taken = takeValue(arg, argv, i, '--allowlist-hosts')
      allowlistedDomains = taken.value.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
      i = taken.next
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown flag ${arg}`)
    } else {
      positional.push(arg)
    }
  }

  const rest = positional[0] === 'crawl' ? positional.slice(1) : positional
  const url = rest[0] ?? null
  if (!resume && url === null) throw new Error(CRAWL_USAGE)
  if (url !== null && !looksLikeUrl(url)) throw new Error(`not a URL: ${url}`)
  return { url, mode, headed, maxPages, maxDepth, taskDir, resume, useCached, allowlistedDomains }
}

function looksLikeUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function defaultTaskDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return resolve(`.w2l/crawl-${stamp}`)
}

/** What a crawl run uses: the flags for a new crawl, the stored task for `--resume`. */
export interface CrawlRunOptions {
  seedUrl: string
  mode: CrawlArgs['mode']
  budget: CrawlBudget
  maxDepth: number | null
  allowlistedDomains: readonly string[]
}

/**
 * `--resume` runs a task with the options it was started with. A flag naming
 * a different value is an error, never silently replaced or ignored; a task
 * stored before its depth and hosts were kept takes those two from the flags.
 */
export function resumeOptions(task: Task, args: CrawlArgs): CrawlRunOptions {
  const stored = task.crawl
  const mode = defaultApiMode(task.mode)
  const differ: string[] = []
  if (args.url !== null && args.url !== task.seedUrl) differ.push(`${args.url} (the task's seed is ${task.seedUrl})`)
  if (args.mode !== 'standard' && args.mode !== mode) differ.push(`--${args.mode} (the task runs in ${mode} mode)`)
  if (args.maxPages !== null && args.maxPages !== task.budget.maxPages) differ.push(`--max-pages ${args.maxPages} (the task's is ${task.budget.maxPages ?? 'unbounded'})`)
  if (args.maxDepth !== null && stored?.maxDepth !== undefined && args.maxDepth !== stored.maxDepth) differ.push(`--max-depth ${args.maxDepth} (the task's is ${stored.maxDepth ?? 'unbounded'})`)
  if (args.allowlistedDomains.length > 0 && stored?.allowlistedDomains !== undefined && !sameHosts(args.allowlistedDomains, stored.allowlistedDomains)) {
    differ.push(`--allowlist-hosts ${args.allowlistedDomains.join(',')} (the task's is ${stored.allowlistedDomains.join(',') || 'the seed host'})`)
  }
  if (differ.length > 0) throw new Error(`--resume continues a crawl with the options it was started with; these differ: ${differ.join('; ')}`)
  return {
    seedUrl: task.seedUrl,
    mode,
    budget: task.budget,
    maxDepth: stored?.maxDepth !== undefined ? stored.maxDepth : args.maxDepth,
    allowlistedDomains: stored?.allowlistedDomains ?? args.allowlistedDomains,
  }
}

function sameHosts(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a.map((host) => host.toLowerCase()))
  const right = new Set(b.map((host) => host.toLowerCase()))
  return left.size === right.size && [...left].every((host) => right.has(host))
}

export async function latestTaskId(store: { listTasks: () => Promise<readonly { id: string }[]> }): Promise<string> {
  const tasks = await store.listTasks()
  const last = tasks[tasks.length - 1]
  if (last === undefined) throw new Error('resume: no task in this directory')
  return last.id
}

export async function runCrawl(args: CrawlArgs): Promise<number> {
  const taskDir = resolve(args.taskDir ?? defaultTaskDir())
  mkdirSync(taskDir, { recursive: true })
  const store = SqliteTaskStore.open(taskDir)

  try {
    let resumeFrom: string | null = null
    let run: CrawlRunOptions | null = null
    if (args.resume) {
      resumeFrom = await latestTaskId(store)
      const task = await store.getTask(resumeFrom)
      if (task === null) throw new Error(`resume: unknown task ${resumeFrom}`)
      run = resumeOptions(task, args)
    } else if (args.url !== null) {
      run = {
        seedUrl: args.url,
        mode: args.mode,
        budget: { maxPages: args.maxPages, maxWallMs: null, maxCostUsd: null, maxTokens: null },
        maxDepth: args.maxDepth,
        allowlistedDomains: args.allowlistedDomains,
      }
    }
    if (run === null) throw new Error(CRAWL_USAGE)

    // Local mode: outbound requests follow the operator's proxy variables,
    // and research mode declares W2L_CONTACT.
    const networkPolicy = { ...withOperatorContact(withEnvironmentProxy(localNetworkPolicy(), process.env), process.env), maxFileBytes: maxFileBytesFromEnv(process.env) }
    // Files the crawl reaches (PDF, CSV, ...) are saved as received in the task directory.
    const channels = buildChannels(run.mode, { headed: args.headed, networkPolicy, fileStore: new FileStore(join(taskDir, 'files')) })
    const policy: CrawlPolicy = {
      mode: run.mode,
      ...(run.allowlistedDomains.length > 0 ? { allowlistedDomains: run.allowlistedDomains } : {}),
    }
    const runner = new LadderRunner(channels, policy, new MemoryRoutingHistory())
    const atom = new LadderScrapeAtom(runner)
    const orchestrator = new CrawlOrchestrator({ store, atom })
    const identity = identityBundleFrom(modeIdentity(run.mode, undefined, networkPolicy.contact ?? null))

    console.log(`mode        : ${run.mode}`)
    console.log(`identity    : ${identity.userAgent}`)
    console.log(`seed        : ${run.seedUrl}`)
    console.log(`task dir    : ${taskDir}`)
    console.log(`checkpoint  : ${taskDir}/${CHECKPOINT_FILENAME}`)
    console.log(`headed      : ${args.headed ? 'yes (browser arm only)' : 'no (CI default)'}`)
    if (networkPolicy.egressProxy) console.log(`proxy       : ${describeEgressProxy(networkPolicy.egressProxy)}`)
    if (args.resume) console.log(`resume      : ${resumeFrom} (stored limits: max pages ${run.budget.maxPages ?? 'unbounded'}, max depth ${run.maxDepth ?? 'unbounded'}, hosts ${run.allowlistedDomains.join(',') || 'seed host'})`)
    if (args.useCached) console.log('cache       : --use-cached')

    try {
      const report = await orchestrator.run({
        seedUrl: run.seedUrl,
        taskDir,
        mode: run.mode,
        budget: run.budget,
        maxDepth: run.maxDepth,
        allowlistedDomains: run.allowlistedDomains,
        resumeFrom,
        useCached: args.useCached,
      })
      const steps = await store.listSteps(report.taskId, report.attemptId)
      const contentful = steps.filter((s) => s.result !== null && CONTENTFUL_STATUS.has(s.result.status)).length
      console.log('')
      console.log(`task        : ${report.taskId}`)
      console.log(`attempt     : ${report.attemptId}`)
      console.log(`status      : ${report.status}`)
      console.log(`pages       : ${report.pagesFetched} (${report.cachedPages} cached, ${contentful} contentful)`)
      if (report.budgetExceeded !== null) console.log(`budget      : ${report.budgetExceeded}`)
      if (report.loopDetected) console.log('loop        : detected')
      for (const step of steps) {
        const tag = step.cached ? ' cached' : ''
        console.log(`page        : ${step.status}${tag} ${step.canonicalUrl}`)
      }
      return report.status === 'completed' ? 0 : 1
    } finally {
      await Promise.all(channels.map((c) => c.close?.().catch(() => {})))
    }
  } finally {
    await store.close()
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    console.log(CRAWL_USAGE)
    return argv.length === 0 ? 1 : 0
  }
  return runCrawl(parseCrawlArgs(argv[0] === 'crawl' ? argv : ['crawl', ...argv]))
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err))
      process.exitCode = 1
    })
}
