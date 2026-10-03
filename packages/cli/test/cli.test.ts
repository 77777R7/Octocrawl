import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer as createNetServer, type AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { COMMANDS, flagName, optionKeys, parseCommandLine, runCli, usage } from '../src/index.js'

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
    expect(() => parseCommandLine('scrape', ['u', '--bogus'])).toThrow('unknown flag --bogus for w2l scrape')
    expect(() => parseCommandLine('scrape', ['u', '--max-pages', '3'])).toThrow('unknown flag --max-pages')
    expect(() => parseCommandLine('scrape', ['u', '--max-age', 'soon'])).toThrow('--max-age takes an integer')
    expect(() => parseCommandLine('scrape', ['u', '--headers', '{bad'])).toThrow('--headers takes JSON')
    expect(() => parseCommandLine('scrape', ['u', '--timeout'])).toThrow('--timeout takes a value')
    expect(() => parseCommandLine('scrape', ['u', '--mobile=yes'])).toThrow('--mobile is true or false')
    expect(() => parseCommandLine('scrape', ['u', '--no-mobile=false'])).toThrow('--no-mobile takes no value')
    expect(() => parseCommandLine('map', ['u', '--out', 'dir'])).toThrow('unknown flag --out for w2l map')
    // A command runs no delivery worker, so it offers no webhook.
    expect(() => parseCommandLine('crawl', ['u', '--webhook', 'https://hooks.example/w'])).toThrow(/--webhook is not offered by the command line.*w2l serve/)
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

describe('w2l against a local site', () => {
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
    expect(files).toEqual(['0001-127.0.0.1-' + new URL(origin).port + '-tides-a.md', '0001-127.0.0.1-' + new URL(origin).port + '-tides-a.table-0.csv', 'results.jsonl'].sort())
    expect(await readFile(join(dir, files.find((file) => file.endsWith('.csv'))!), 'utf8')).toBe('Station,Height\r\n"North, ""outer""",4.2\r\n')
  })

  it('refuses what the API refuses, with the API\'s message, before fetching', async () => {
    const refused = await cli(['scrape', `${origin}/tides/a`, '--max-age', '-1'])
    expect(refused.code).toBe(2)
    expect(refused.err).toMatch(/maxAge must be an integer number of milliseconds/)
    expect((await cli(['fetch', 'x'])).code).toBe(2)
    expect((await cli(['scrape'])).err).toMatch(/takes one URL/)
  })

  it('runs a batch and a crawl to the end and answers with the report and every page; maps a site', async () => {
    const urlsFile = join(root, 'urls.txt')
    await writeFile(urlsFile, `# tide pages\n${origin}/tides/a\n\n${origin}/tides/c\n`)
    const batch = await cli(['batch', `${origin}/tides/b`, '--urls-file', urlsFile, '--max-concurrency', '2'])
    expect(batch.code).toBe(0)
    expect(batch.err).toMatch(/w2l batch: task [0-9a-f-]{36}/)
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
    expect((await serving).code).toBe(0)
  })
})

async function freePort(): Promise<number> {
  const probe = createNetServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return port
}
