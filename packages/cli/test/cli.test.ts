import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer as createNetServer, type AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The options each one-off command gives the engine, recorded on the way through (the engine itself is the real one).
const engineOptions = vi.hoisted(() => [] as Record<string, unknown>[])
vi.mock('@w2l/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@w2l/api')>()
  return { ...actual, createApiEngine: (options: Parameters<typeof actual.createApiEngine>[0]) => { engineOptions.push({ ...options }); return actual.createApiEngine(options) } }
})

import { COMMANDS, EVIDENCE_COLUMNS, flagName, optionKeys, parseCommandLine, runCli, usage } from '../src/index.js'
import { motionTerminal } from '../src/motion.js'
import { verdictLine } from '../src/run.js'
import { screen } from './screen.js'

describe('flags', () => {
  it('names every API option in kebab case', () => {
    expect(flagName('maxAge')).toBe('max-age')
    expect(flagName('onlyMainContent')).toBe('only-main-content')
    expect(flagName('regexOnFullURL')).toBe('regex-on-full-url')
    expect(flagName('ignoreInvalidURLs')).toBe('ignore-invalid-urls')
    expect(flagName('deduplicateSimilarURLs')).toBe('deduplicate-similar-urls')
    // Every option of every command is listed in its help, and no URL or origin key is a flag.
    for (const command of COMMANDS) {
      const help = usage(command)
      for (const key of optionKeys(command)) expect(help, `${command} ${key}`).toContain(`--${flagName(key)}`)
      expect(optionKeys(command)).not.toContain('origin')
    }
  })

  it('takes --handoff on a batch and a scrape, not on a crawl', () => {
    expect(parseCommandLine('batch', ['https://example.com/', '--handoff']).cli).toEqual({ handoff: true })
    expect(parseCommandLine('scrape', ['https://example.com/', '--handoff']).body).toEqual({ handoff: true })
    expect(() => parseCommandLine('crawl', ['https://example.com/', '--handoff'])).toThrow('unknown flag --handoff')
    expect(usage('batch')).toContain('--handoff')
    expect(usage('scrape')).toContain('--handoff')
  })

  it('says in its help how to read a page behind your login, and what each route needs', () => {
    expect(usage(null)).toContain('A page behind your login: --lane my-browser reads it in the Chrome you are signed in to; --mode authed reads it with a login you saved')
    for (const command of ['scrape', 'batch'] as const) {
      expect(usage(command)).toContain('--lane my-browser: for a page behind your login')
      // The first thing the lane needs, which its own lines did not say.
      expect(usage(command)).toMatch(/--lane my-browser:[^]*remote debugging on/)
    }
  })

  it('takes --login-walls-of <id> on a batch in place of URLs (login UX A4)', () => {
    const id = '00000000-0000-4000-8000-000000000000'
    expect(parseCommandLine('batch', ['--login-walls-of', id, '--mode', 'authed']).body).toEqual({ loginWallsOf: id, mode: 'authed' })
    expect(usage('batch')).toContain('--login-walls-of')
  })

  it('takes --lane my-browser on a scrape', () => {
    expect(parseCommandLine('scrape', ['https://example.com/', '--lane', 'my-browser']).body).toEqual({ lane: 'my-browser' })
    expect(usage('scrape')).toContain('--lane my-browser')
    expect(parseCommandLine('batch', ['https://example.com/', '--lane', 'my-browser']).body).toEqual({ lane: 'my-browser' })
    expect(usage('batch')).toContain('--lane my-browser')
    expect(parseCommandLine('crawl', ['https://example.com/', '--access', 'standard']).body).toEqual({ access: 'standard' })
    // A task contract (ADR 0006) as JSON, checked by the same parser as the REST body.
    expect(parseCommandLine('scrape', ['https://example.com/', '--verify', '{"checks":[{"type":"minTables","min":1}],"emptyOk":true}']).body).toEqual({ verify: { checks: [{ type: 'minTables', min: 1 }], emptyOk: true } })
  })

  it('reads booleans, integers, lists, repeated patterns, formats, parsers and headers into the API body', () => {
    const line = parseCommandLine('crawl', [
      'https://example.com/', '--max-pages', '5', '--no-only-main-content', '--mobile', '--fast-mode=false',
      '--include-tags', 'main,article', '--include-tags=table', '--include-paths', '^/a,b', '--include-paths', '^/c',
      '--formats', 'markdown,tables', '--parsers', 'none', '--header', 'accept-language: de', '--header', 'x-run=1',
      '--sitemap', 'skip', '--max-age', '3600000', '--out', '/tmp/x',
    ])
    expect(line.urls).toEqual(['https://example.com/'])
    expect(line.cli).toEqual({ out: '/tmp/x' })
    expect(line.body).toEqual({
      maxPages: 5, onlyMainContent: false, mobile: true, fastMode: false, includeTags: ['main', 'article', 'table'], includePaths: ['^/a,b', '^/c'],
      formats: ['markdown', 'tables'], parsers: [], headers: { 'accept-language': 'de', 'x-run': '1' }, sitemap: 'skip', maxAge: 3600000,
    })
    expect(parseCommandLine('scrape', ['u', '--formats', '[{"type":"screenshot","fullPage":true}]', '--parsers', '{"type":"pdf","maxPages":2}']).body)
      .toEqual({ formats: [{ type: 'screenshot', fullPage: true }], parsers: [{ type: 'pdf', maxPages: 2 }] })
  })

  it('refuses an unknown flag, a flag of another command and a malformed value by name', () => {
    expect(() => parseCommandLine('scrape', ['u', '--bogus'])).toThrow('unknown flag --bogus for octocrawl scrape')
    expect(() => parseCommandLine('scrape', ['u', '--max-pages', '3'])).toThrow('unknown flag --max-pages')
    expect(() => parseCommandLine('scrape', ['u', '--max-age', 'soon'])).toThrow('--max-age takes an integer')
    expect(() => parseCommandLine('scrape', ['u', '--headers', '{bad'])).toThrow('--headers takes JSON')
    expect(() => parseCommandLine('scrape', ['u', '--timeout'])).toThrow('--timeout takes a value')
    expect(() => parseCommandLine('scrape', ['u', '--mobile=yes'])).toThrow('--mobile is true or false')
    expect(() => parseCommandLine('scrape', ['u', '--no-mobile=false'])).toThrow('--no-mobile takes no value')
    expect(() => parseCommandLine('scrape', ['u', '--task-root='])).toThrow('--task-root takes a directory')
    // The command line's own flags on a command that does not take them are sent where they belong, and each command's help lists its own.
    expect(() => parseCommandLine('map', ['u', '--out', 'dir'])).toThrow('--out is not taken by map: its answer is the JSON on stdout')
    expect(() => parseCommandLine('batch', ['u', '--markdown'])).toThrow('--markdown prints a scrape\'s Markdown alone; a batch or crawl writes each page\'s Markdown to a file with --out <dir>')
    expect(() => parseCommandLine('scrape', ['u', '--urls-file', 'f'])).toThrow('--urls-file <file> is a batch flag')
    expect(() => parseCommandLine('batch', ['u', '--resume', 'x'])).toThrow('--resume <taskId> is a crawl flag')
    expect(usage('scrape')).toMatch(/--markdown {3}print the Markdown alone/)
    expect(usage('scrape')).toMatch(/--out <dir> {3}write results\.jsonl/)
    expect(usage('batch')).toMatch(/--urls-file <file> {3}one URL per line/)
    expect(usage('crawl')).toMatch(/--resume <taskId> {3}continue a crawl/)
    expect(usage(null)).toContain('octocrawl --version prints the version')
    // A command runs no delivery worker, so it offers no webhook.
    expect(() => parseCommandLine('crawl', ['u', '--webhook', 'https://hooks.example/w'])).toThrow(/--webhook is not offered by the command line.*octocrawl serve/)
    expect(() => parseCommandLine('batch', ['u', '--webhook={"url":"https://hooks.example/w"}'])).toThrow(/--webhook is not offered/)
  })

  it('takes --no-motion on every command', () => {
    for (const command of COMMANDS) {
      expect(parseCommandLine(command, ['u', '--no-motion']).cli).toEqual({ noMotion: true })
      expect(usage(command)).toContain('--no-motion   draw no octopus on the terminal while it runs (or set OCTOCRAWL_NO_MOTION=1)')
    }
    expect(() => parseCommandLine('scrape', ['u', '--no-motion=1'])).toThrow('--no-motion takes no value')
  })
})

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning for the pilots. '.repeat(3)
const page = (title: string, extra = '') => `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><article><h1>${title}</h1><p>${PROSE}</p>${extra}<p><a href="/tides/b">Next</a></p></article></main></body></html>`
const TABLE = '<table><tr><th>Station</th><th>Height</th></tr><tr><td>North, "outer"</td><td>4.2</td></tr></table>'

let server: Server
let origin: string
let root: string

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
    // A page that takes long enough for the terminal's octopus to be drawn; the same page under every path.
    if (req.url?.startsWith('/pause')) { setTimeout(() => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page('Pause')), 700); return }
    if (req.url?.startsWith('/slow')) { setTimeout(() => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page('Slow')), 3_000); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(`Tides ${req.url}`, req.url === '/tides/a' ? TABLE : ''))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  root = await mkdtemp(join(tmpdir(), 'w2l-cli-'))
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(root, { recursive: true, force: true })
})

async function cli(argv: string[], signal?: AbortSignal): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = []
  const err: string[] = []
  const code = await runCli(argv, { env: { W2L_TASK_ROOT: join(root, 'tasks') }, stdout: (text) => out.push(text), stderr: (text) => err.push(text), ...(signal === undefined ? {} : { signal }) })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

describe('octocrawl against a local site', () => {
  it('scrapes a page as JSON with its Evidence Record, as Markdown alone, and to files with each table as CSV', async () => {
    const json = await cli(['scrape', `${origin}/tides/a`, '--formats', 'markdown,tables'])
    expect(json.code).toBe(0)
    const response = JSON.parse(json.out)
    expect(response).toMatchObject({ status: 'success', formats: ['markdown', 'tables'], evidenceRecord: { requestedUrl: `${origin}/tides/a`, status: 'success' } })
    expect(response.tables[0].rows).toEqual([['Station', 'Height'], ['North, "outer"', '4.2']])

    const markdown = await cli(['scrape', `${origin}/tides/a`, '--markdown'])
    expect(markdown.out.startsWith('# Tides /tides/a')).toBe(true)

    const dir = join(root, 'out-scrape')
    const written = await cli(['scrape', `${origin}/tides/a`, '--formats', 'markdown,tables', '--out', dir])
    expect(written.code).toBe(0)
    const files = (await readdir(dir)).sort()
    expect(files).toEqual(['0001-127.0.0.1-' + new URL(origin).port + '-tides-a.md', '0001-127.0.0.1-' + new URL(origin).port + '-tides-a.table-0.csv', 'results.csv', 'results.jsonl'].sort())
    expect(await readFile(join(dir, files.find((file) => file.endsWith('.csv'))!), 'utf8')).toBe('Station,Height\r\n"North, ""outer""",4.2\r\n')
  })

  it('says on stderr what a result that is not the page is, in every output mode, with the first hint', async () => {
    // A page that answers after the deadline: --markdown prints nothing on stdout, and stderr says why and what to do.
    const markdown = await cli(['scrape', `${origin}/slow`, '--timeout', '1000', '--markdown'])
    expect(markdown.code).toBe(1)
    expect(markdown.out).toBe('')
    expect(markdown.err).toMatch(/^octocrawl scrape: failed \(timeout\); no lane answered within the request's deadline; raise timeout \(up to 300000 ms\)$/)
    // The same line beside the JSON, and beside the files.
    const json = await cli(['scrape', `${origin}/slow`, '--timeout', '1000'])
    expect(json.code).toBe(1)
    expect(JSON.parse(json.out)).toMatchObject({ status: 'failed', failureReason: 'timeout' })
    expect(json.err).toMatch(/octocrawl scrape: failed \(timeout\); no lane answered/)
    const dir = join(root, 'out-slow')
    const written = await cli(['scrape', `${origin}/slow`, '--timeout', '1000', '--out', dir])
    expect(written.code).toBe(1)
    expect(written.err).toMatch(/octocrawl: wrote 1 results[\s\S]*octocrawl scrape: failed \(timeout\)/)
    // A page that was read says nothing more on stderr unless stdout is a terminal, where one line says what the JSON holds.
    const quiet = await cli(['scrape', `${origin}/tides/a`, '--markdown'])
    expect(quiet.err).not.toMatch(/octocrawl scrape:/)
    const err: string[] = []
    const code = await runCli(['scrape', `${origin}/tides/a`], { env: { W2L_TASK_ROOT: join(root, 'tasks') }, stdout: () => {}, stderr: (text) => err.push(text), tty: true })
    expect(code).toBe(0)
    expect(err.at(-1)).toMatch(/^octocrawl scrape: success on the http lane; [\d,]+ characters of Markdown in the JSON above \(--markdown prints the Markdown alone, --out <dir> writes files\)$/)
    // Without the markdown format there is no Markdown to count: the line names the formats instead.
    const formatsErr: string[] = []
    await runCli(['scrape', `${origin}/tides/a`, '--formats', 'links'], { env: { W2L_TASK_ROOT: join(root, 'tasks') }, stdout: () => {}, stderr: (text) => formatsErr.push(text), tty: true })
    expect(formatsErr.at(-1)).toMatch(/^octocrawl scrape: success on the http lane; the links format in the JSON above/)
    expect(verdictLine('scrape', { status: 'empty_verified' })).toBe('octocrawl scrape: empty_verified (the page was read and holds nothing to extract)')
    expect(verdictLine('scrape', { status: 'success', warnings: [{ code: 'redirected_off_page', message: 'sent on' }], agentHints: ['example.test answered / in place of /x'] })).toBe('octocrawl scrape: success, but the site answered another page; example.test answered / in place of /x')
    expect(verdictLine('scrape', { status: 'blocked', blockReason: 'login_wall', failureReason: null })).toBe('octocrawl scrape: blocked (login_wall)')
    expect(verdictLine('scrape', { status: 'failed', failureReason: 'empty_unverified', warnings: [{ code: 'browser_not_installed', message: 'Chromium is not installed; run npx playwright install chromium' }] })).toBe('octocrawl scrape: failed (empty_unverified); Chromium is not installed; run npx playwright install chromium')
    expect(verdictLine('scrape', { status: 'success' })).toBeNull()
  })

  it('writes results.csv with one row of evidence per page, a failed page kept, hashes matching the files', async () => {
    const dir = join(root, 'out-batch')
    const unreachable = 'http://127.0.0.1:1/gone'
    const written = await cli(['batch', `${origin}/tides/a`, unreachable, '--out', dir])
    expect(written.code).toBe(0)
    expect(written.err).toMatch(/^octocrawl: wrote 2 results \(results.jsonl, results.csv\), 1 Markdown files/m)
    const lines = (await readFile(join(dir, 'results.csv'), 'utf8')).split('\r\n')
    expect(lines.at(-1)).toBe('')
    expect(lines[0]).toBe(EVIDENCE_COLUMNS.join(','))
    expect(lines[0]).toBe('url,status,reason,final_url,fetched_at,http_status,lane,robots_decision,raw_sha256,markdown_sha256,extractor,source_commit,cache_state,cached_at,verification,markdown_file')
    const rows = lines.slice(1, -1).map((line) => Object.fromEntries(line.split(',').map((value, i) => [EVIDENCE_COLUMNS[i], value])))
    expect(rows).toHaveLength(2)
    const items = (await readFile(join(dir, 'results.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    const ok = rows.find((row) => row.url === `${origin}/tides/a`)!
    const record = items.find((item) => item.url === `${origin}/tides/a`).evidenceRecord
    expect(ok).toMatchObject({ status: 'success', reason: '', final_url: record.finalUrl, fetched_at: record.fetchedAt, http_status: '200', lane: 'http', robots_decision: 'allowed', raw_sha256: record.rawSha256, extractor: record.extractor.version, cache_state: '' })
    expect(ok.markdown_sha256).toBe(createHash('sha256').update(await readFile(join(dir, ok.markdown_file!))).digest('hex'))
    // No task contract was sent: the page says so (ADR 0006).
    expect(ok.verification).toBe('not_requested')
    // The page W2L could not read stays in the file, with its reason; what was not observed is empty, not 0.
    const failed = rows.find((row) => row.url === unreachable)!
    expect(failed.status).toBe('failed')
    expect(failed.reason).not.toBe('')
    expect(failed).toMatchObject({ http_status: '', raw_sha256: '', markdown_sha256: '', markdown_file: '' })
  })

  it('gives a scrape\'s cache outcome in results.csv, read from the response metadata', async () => {
    const row = async (dir: string) => {
      expect((await cli(['scrape', `${origin}/tides/cached`, '--max-age', '600000', '--out', dir])).code).toBe(0)
      const [header, line] = (await readFile(join(dir, 'results.csv'), 'utf8')).split('\r\n')
      return Object.fromEntries(line!.split(',').map((value, i) => [header!.split(',')[i], value]))
    }
    const first = await row(join(root, 'out-cache-1'))
    const second = await row(join(root, 'out-cache-2'))
    expect(first).toMatchObject({ status: 'success', cache_state: 'miss', cached_at: '' })
    expect(second).toMatchObject({ status: 'success', cache_state: 'hit', cached_at: first.fetched_at, fetched_at: first.fetched_at })
  })

  it('refuses what the API refuses, with the API\'s message, before fetching', async () => {
    const refused = await cli(['scrape', `${origin}/tides/a`, '--max-age', '-1'])
    expect(refused.code).toBe(2)
    expect(refused.err).toMatch(/maxAge must be an integer number of milliseconds/)
    expect((await cli(['fetch', 'x'])).code).toBe(2)
    expect((await cli(['scrape'])).err).toMatch(/^octocrawl scrape: takes one URL, got 0 \(octocrawl scrape --help\)$/)
    // No command at all is an error: the usage goes to stderr with exit 2; asked for, it is the answer on stdout.
    const bare = await cli([])
    expect(bare).toMatchObject({ code: 2, out: '' })
    expect(bare.err).toMatch(/^usage: octocrawl <command>/)
    expect((await cli(['--help'])).out).toMatch(/^usage: octocrawl <command>/)
    // A URL without its scheme is answered with the URL meant, before the API's own check.
    expect(await cli(['scrape', 'example.com'])).toMatchObject({ code: 2, err: 'octocrawl scrape: "example.com" has no scheme; did you mean https://example.com?' })
    // A local address is plain http; an IDN host and a port are still a host.
    expect((await cli(['scrape', 'localhost:8787/x'])).err).toBe('octocrawl scrape: "localhost:8787/x" has no scheme; did you mean http://localhost:8787/x?')
    expect((await cli(['scrape', '127.0.0.1:8787'])).err).toBe('octocrawl scrape: "127.0.0.1:8787" has no scheme; did you mean http://127.0.0.1:8787?')
    expect((await cli(['scrape', 'bücher.de/a'])).err).toBe('octocrawl scrape: "bücher.de/a" has no scheme; did you mean https://bücher.de/a?')
    expect((await cli(['batch', 'https://example.com/', 'not a url'])).err).toBe('octocrawl batch: "not a url" is not a URL: a URL starts with http:// or https://')
    expect((await cli(['batch', 'https://example.com/', 'not a url', '--ignore-invalid-urls', '--max-concurrency', '1'])).code).toBe(0)
    // A batch of another's pages at a login wall takes no URL of its own, and names a batch of this task root.
    expect(await cli(['batch', '--login-walls-of', '00000000-0000-4000-8000-000000000000', '--mode', 'authed'])).toMatchObject({ code: 2, err: expect.stringContaining('no batch 00000000-0000-4000-8000-000000000000') })
    expect((await cli(['batch', '--mode', 'authed'])).err).toContain('takes URLs as arguments or --urls-file <file>')
    // Every message names the command the person types.
    expect((await cli(['bogus'])).err).toMatch(/^octocrawl: unknown command bogus/)
    // A one-off command listens nowhere: a listen address for the API server in the environment is not its concern.
    const out: string[] = []
    const err: string[] = []
    const code = await runCli(['scrape', `${origin}/tides/a`, '--markdown'], { env: { W2L_TASK_ROOT: join(root, 'tasks'), W2L_API_HOST: '0.0.0.0' }, stdout: (text) => out.push(text), stderr: (text) => err.push(text) })
    expect({ code, err: err.join('\n') }).toMatchObject({ code: 0 })
    // A grant with a problem is a usage error, named, before anything is fetched: not a stack trace.
    const grantErr: string[] = []
    const badGrant = await runCli(['scrape', `${origin}/tides/a`], { env: { W2L_TASK_ROOT: join(root, 'tasks'), W2L_ACCESS_GRANT: JSON.stringify({ tier: 'standard', capabilities: ['camoufox'] }) }, stdout: () => {}, stderr: (text) => grantErr.push(text) })
    expect(badGrant).toBe(2)
    expect(grantErr.join('\n')).toMatch(/access grant refused \(ADR 0005\):\n  - capabilities\.camoufox: camoufox is deferred/)
    expect(grantErr.join('\n')).not.toMatch(/\n\s+at /)
  })

  it('gives the engine the browser identity W2L_BROWSER_IDENTITY names, as the API server does', async () => {
    engineOptions.length = 0
    const err: string[] = []
    const code = await runCli(['scrape', `${origin}/tides/a`, '--markdown'], { env: { W2L_TASK_ROOT: join(root, 'tasks'), W2L_BROWSER_IDENTITY: 'actual' }, stdout: () => {}, stderr: (text) => err.push(text) })
    expect(code).toBe(0)
    expect(err.join('\n')).toMatch(/browser identity: actual/)
    expect(engineOptions.map((options) => options.browserIdentity)).toEqual(['actual'])
  })

  it('runs a batch and a crawl to the end and answers with the report and every page; maps a site', async () => {
    const urlsFile = join(root, 'urls.txt')
    await writeFile(urlsFile, `# tide pages\n${origin}/tides/a\n\n${origin}/tides/c\n`)
    const batch = await cli(['batch', `${origin}/tides/b`, '--urls-file', urlsFile, '--max-concurrency', '2'])
    expect(batch.code).toBe(0)
    expect(batch.err).toMatch(/octocrawl batch: task [0-9a-f-]{36}/)
    // One line on how it ended, and where the pages are.
    expect(batch.err).toMatch(/octocrawl batch: completed; 3 of 3 pages read; the report and every page are the JSON above \(--out <dir> writes them as files\)$/)
    const answer = JSON.parse(batch.out)
    expect(answer.report).toMatchObject({ status: 'completed', requested: 3, completed: 3 })
    expect(answer.items.map((item: { url: string }) => item.url).sort()).toEqual([`${origin}/tides/a`, `${origin}/tides/b`, `${origin}/tides/c`])

    const crawl = await cli(['crawl', `${origin}/tides/`, '--max-pages', '2', '--sitemap', 'skip'])
    expect(crawl.code).toBe(0)
    const crawled = JSON.parse(crawl.out)
    expect(crawled.report.status).toBe('completed')
    expect(crawled.items.map((item: { url: string }) => item.url)).toEqual([`${origin}/tides/`, `${origin}/tides/b`])

    const map = await cli(['map', `${origin}/tides/`, '--sitemap', 'skip'])
    expect(map.code).toBe(0)
    expect(JSON.parse(map.out).links.map((link: { url: string }) => link.url)).toContain(`${origin}/tides/b`)
  })

  it('draws the octopus on stderr when it is a terminal, while a scrape or a map runs, and changes no other byte', async () => {
    const HIDE = '\x1b[?25l'
    const SHOW = '\x1b[?25h'
    const run = async (argv: string[], options: { terminal?: boolean; env?: Record<string, string>; signal?: AbortSignal } = {}) => {
      const out: string[] = []
      const err: string[] = []
      const drawn: string[] = []
      // What reached stderr, in order: the command's lines and the drawing's writes.
      const stderr: string[] = []
      const code = await runCli(argv, {
        env: { W2L_TASK_ROOT: join(root, 'tasks'), ...options.env }, stdout: (text) => out.push(text), stderr: (text) => { err.push(text); stderr.push(text) },
        ...(options.terminal === false ? {} : { motion: { write: (text: string) => { drawn.push(text); stderr.push(text) }, size: () => ({ columns: 100, rows: 30 }) } }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      })
      return { code, out: out.join('\n'), err: err.join('\n'), drawn, stderr }
    }
    // stderr is no terminal: nothing is drawn, and no escape sequence is written anywhere.
    const piped = await run(['scrape', `${origin}/pause/a`, '--markdown'], { terminal: false })
    expect(piped.code).toBe(0)
    expect(piped.out).toContain('# Pause')
    expect(piped.out + piped.err).not.toContain('\x1b')
    // A terminal: drawn while the scrape runs, with the stage the engine reported, then wiped and the cursor given back.
    const watched = await run(['scrape', `${origin}/pause/b`, '--markdown'])
    expect(watched.drawn.length).toBeGreaterThan(3)
    expect(watched.drawn[0]!.startsWith(HIDE)).toBe(true)
    expect(watched.drawn.join('')).toContain('robots.txt allows it · fetching the page')
    expect(watched.drawn.at(-2)).toBe('\x1b[15A\r\x1b[J')
    expect(watched.drawn.at(-1)).toBe(SHOW)
    // What the command answers, and says, is the same bytes with the drawing as without.
    expect({ code: watched.code, out: watched.out, err: watched.err }).toEqual({ code: piped.code, out: piped.out, err: piped.err })
    // Switched off, a terminal gets nothing either.
    for (const [flags, env] of [[['--no-motion'], {}], [[], { OCTOCRAWL_NO_MOTION: '1' }], [[], { CI: 'true' }]] as Array<[string[], Record<string, string>]>) {
      const off = await run(['scrape', `${origin}/pause/c${flags.length}${Object.keys(env).join('')}`, '--markdown', ...flags], { env })
      expect(off.drawn, JSON.stringify([flags, env])).toEqual([])
      expect(off.out).toBe(piped.out)
    }
    // A map reports no stages: the drawing says what it maps, and the map is the one it was.
    const plainMap = await run(['map', `${origin}/pause/`], { terminal: false })
    const watchedMap = await run(['map', `${origin}/pause/`])
    expect(watchedMap.drawn.join('')).toContain(`Mapping ${new URL(origin).host}`)
    expect(watchedMap.drawn.at(-1)).toBe(SHOW)
    expect(JSON.parse(watchedMap.out).links).toEqual(JSON.parse(plainMap.out).links)
    expect(watchedMap.err).toBe(plainMap.err)
    // Ctrl-C with the drawing up: it is wiped and the cursor comes back before the command says it was interrupted.
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 800)
    const interrupted = await run(['scrape', `${origin}/slow/motion`], { signal: controller.signal })
    expect(interrupted.code).toBe(130)
    expect(interrupted.err).toBe('octocrawl scrape: interrupted')
    expect(interrupted.drawn[0]!.startsWith(HIDE)).toBe(true)
    expect(interrupted.stderr.slice(-3)).toEqual(['\x1b[15A\r\x1b[J', SHOW, 'octocrawl scrape: interrupted'])
  })

  it('draws the octopus with the job\'s count while a batch or a crawl runs, and leaves the terminal with the command\'s lines alone', async () => {
    // stderr as cli.ts gives it to the command: one terminal, the command's lines and the drawing both written to it.
    const run = async (argv: string[], options: { terminal?: boolean; signal?: AbortSignal; sayAt?: number } = {}) => {
      const out: string[] = []
      const written: string[] = []
      const stream = { write: (text: string): boolean => { written.push(text); return true }, columns: 100, rows: 30 }
      const motion = options.terminal === false ? undefined : motionTerminal(stream)
      // A line something else writes to stderr while the job runs, as the engine's log does.
      const said = options.sayAt === undefined ? undefined : setTimeout(() => stream.write('a line said while the job runs\n'), options.sayAt)
      const code = await runCli(argv, {
        env: { W2L_TASK_ROOT: join(root, 'tasks') }, stdout: (text) => out.push(text), stderr: (text) => { stream.write(`${text}\n`) },
        ...(motion === undefined ? {} : { motion }), ...(options.signal === undefined ? {} : { signal: options.signal }),
      })
      clearTimeout(said)
      return { code, out: out.join('\n'), written }
    }
    const pages = (out: string): Array<[string, string]> => (JSON.parse(out) as { items: Array<{ url: string; status: string }> }).items.map((item): [string, string] => [item.url, item.status]).sort()

    const urls = ['a', 'b', 'c'].map((name) => `${origin}/pause/batch-${name}`)
    const piped = await run(['batch', ...urls], { terminal: false })
    expect(piped.written.join('')).not.toContain('\x1b')
    const watched = await run(['batch', ...urls.map((url) => `${url}?watched`)], { sayAt: 500 })
    expect(watched.code).toBe(0)
    // Drawn with the batch's own count, then gone: the screen holds what the command said and what was said beside it, nothing of the drawing.
    expect(watched.written.join('')).toMatch(/\d\/3 pages done/)
    expect(watched.written.join('')).toContain('\x1b[?25l')
    const lines = screen(watched.written)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/^octocrawl batch: task /)
    expect(lines[1]).toBe('a line said while the job runs')
    expect(lines[2]).toBe(screen(piped.written)[1])
    expect(pages(watched.out).map(([, status]) => status)).toEqual(pages(piped.out).map(([, status]) => status))
    // Switched off, the terminal gets the command's lines and no escape sequence.
    const off = await run(['batch', ...urls.map((url) => `${url}?off`), '--no-motion'])
    expect(off.written.join('')).not.toContain('\x1b')
    expect(off.written).toHaveLength(2)

    // A crawl counts the pages it has fetched and names its site.
    const crawled = await run(['crawl', `${origin}/pause/crawl/`, '--max-pages', '2', '--sitemap', 'skip'])
    expect(crawled.code).toBe(0)
    expect(crawled.written.join('')).toContain(`Crawling ${new URL(origin).host}`)
    expect(crawled.written.join('')).toMatch(/\d pages? fetched/)
    expect(screen(crawled.written)).toHaveLength(2)
    expect(screen(crawled.written)[1]).toMatch(/^octocrawl crawl: completed; /)

    // Ctrl-C with the drawing up: wiped, the cursor back, then the line that says the job is paused.
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 800)
    const interrupted = await run(['crawl', `${origin}/slow/crawl-motion/`, '--max-pages', '1', '--sitemap', 'skip'], { signal: controller.signal })
    expect(interrupted.code).toBe(130)
    expect(interrupted.written.at(-2)).toBe('\x1b[?25h')
    expect(interrupted.written.at(-1)).toMatch(/^octocrawl crawl: interrupted; the task is paused/)
    expect(screen(interrupted.written)).toHaveLength(2)
  })

  it('answers 130 when a scrape is interrupted, and refuses to resume a crawl another process may be running', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 300)
    const interrupted = await cli(['scrape', `${origin}/slow/a`], controller.signal)
    expect(interrupted.code).toBe(130)

    const port = await freePort()
    const shared = join(root, 'shared')
    const stop = new AbortController()
    const serving = cli(['serve', '--port', String(port), '--task-root', shared], stop.signal)
    let started: { taskId?: string } = {}
    for (let i = 0; i < 100 && started.taskId === undefined; i++) {
      started = await fetch(`http://127.0.0.1:${port}/v1/crawl`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: `${origin}/slow/`, maxPages: 1, sitemap: 'skip' }) })
        .then((res) => res.json() as Promise<{ taskId?: string }>, () => ({}))
      if (started.taskId === undefined) await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const resumed = await cli(['crawl', '--resume', started.taskId!, '--task-root', shared])
    expect(started.taskId).toMatch(/^[0-9a-f-]{36}$/)
    expect(resumed.code).toBe(2)
    expect(resumed.err).toMatch(/is (pending|running): another process may be running it/)
    stop.abort()
    expect((await serving).code).toBe(0)
  })

  it('serves the API until stopped', async () => {
    const port = await freePort()
    const controller = new AbortController()
    const serving = cli(['serve', '--port', String(port)], controller.signal)
    let status = 0
    for (let i = 0; i < 100 && status !== 200; i++) {
      status = await fetch(`http://127.0.0.1:${port}/v1/crawl/active`).then((res) => res.status, () => 0)
      if (status !== 200) await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(status).toBe(200)
    controller.abort()
    const served = await serving
    expect(served.code).toBe(0)
    // What it printed as it started: where it listens, how an agent reaches it (this port is not the default), how it stops.
    expect(served.err).toMatch(new RegExp(`octocrawl local API listening on http://127\\.0\\.0\\.1:${port}`))
    expect(served.err).toContain(`claude mcp add octocrawl -- npx -y @octocrawl/mcp (this server is not on the default port, so set W2L_API_URL=http://127.0.0.1:${port} where the MCP server runs)`)
    expect(served.err).toContain('Ctrl-C stops the server')
    expect(served.err).not.toContain('w2l-api')
  })

  it('draws under its log what the server is doing, on a terminal: a line while idle, the octopus and a line a call while it works', async () => {
    const host = new URL(origin).host
    // octocrawl serve with stderr as cli.ts gives it: one terminal, the server's lines and the drawing both written to it.
    const serve = async (flags: string[], terminal: boolean, work: (base: string, written: string[]) => Promise<void>) => {
      const port = await freePort()
      const controller = new AbortController()
      const written: string[] = []
      const stream = { write: (text: string): boolean => { written.push(text); return true }, columns: 100, rows: 30 }
      const motion = terminal ? motionTerminal(stream) : undefined
      const serving = runCli(['serve', '--port', String(port), '--task-root', join(root, `serve-${port}`), ...flags], {
        env: {}, stdout: () => {}, stderr: (text) => { stream.write(`${text}\n`) }, signal: controller.signal, ...(motion === undefined ? {} : { motion }),
      })
      const base = `http://127.0.0.1:${port}`
      try {
        await expect.poll(() => fetch(`${base}/v1/crawl/active`).then((res) => res.status, () => 0), { timeout: 10_000 }).toBe(200)
        await work(base, written)
      } finally { controller.abort() }
      return { code: await serving, written }
    }
    const post = (base: string, path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    /** A scrape and a map at once, as two callers. */
    const twoCalls = async (base: string): Promise<void> => {
      const [scraped, mapped] = await Promise.all([
        post(base, '/v1/scrape', { url: `${origin}/pause/serve`, origin: 'mcp-claude-code@2.1.301' }),
        post(base, '/v1/map', { url: `${origin}/pause/`, sitemap: 'skip' }),
      ])
      expect([scraped.status, mapped.status]).toEqual([200, 200])
    }

    const watched = await serve([], true, async (base, written) => {
      // Idle: one line under what the server said as it started.
      await expect.poll(() => screen(written).at(-1)).toBe('  Waiting for calls')
      await twoCalls(base)
      await expect.poll(() => screen(written).at(-1)).toBe('  Waiting for calls · 2 answered so far')
    })
    expect(watched.code).toBe(0)
    const drawn = watched.written.join('')
    // Each call had its own line: who called and what, the site, and the scrape's own stage.
    expect(drawn).toContain(`claude-code · scrape ${host} · robots.txt allows it · fetching the page`)
    expect(drawn).toContain(`  map ${host}`)
    expect(drawn).toContain(',=####=,')
    // Stopped, the terminal holds what the server said and nothing of the drawing, and has its cursor back.
    expect(watched.written.at(-1)).toBe('\x1b[?25h')
    const left = screen(watched.written)
    expect(left.some((line) => line.startsWith('  '))).toBe(false)

    // stderr that is no terminal gets the server's lines alone, byte for byte what a terminal is left with.
    const piped = await serve([], false, (base) => twoCalls(base))
    expect(piped.written.join('')).not.toContain('\x1b')
    const portless = (lines: readonly string[]): string[] => lines.map((line) => line.replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:PORT'))
    expect(portless(left)).toEqual(portless(piped.written.join('').split('\n').slice(0, -1)))
    // Switched off, a terminal gets the same; the server does not see the flag.
    const off = await serve(['--no-motion'], true, (base) => twoCalls(base))
    expect(off.code).toBe(0)
    expect(off.written.join('')).not.toContain('\x1b')
  })
})

async function freePort(): Promise<number> {
  const probe = createNetServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return port
}
