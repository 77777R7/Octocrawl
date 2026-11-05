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
import { verdictLine } from '../src/run.js'

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
})

async function freePort(): Promise<number> {
  const probe = createNetServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return port
}
