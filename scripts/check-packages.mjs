#!/usr/bin/env node
// Installs the tarballs scripts/pack-packages.mjs made into a new, empty npm
// project outside the repository and uses each package as a user would,
// against a site on loopback:
//
//   @octocrawl/cli  `octocrawl scrape` (a page with a table, as JSON with its CSV;
//                   a PDF, which needs pdfjs-dist's assets), then `octocrawl serve`
//   @octocrawl/sdk  scrape through that server, imported as ESM and required as CJS
//   @octocrawl/mcp  `octocrawl-mcp` over stdio: initialize, tools/list, a scrape tool call
//   octocrawl       the CLI under the unscoped name, in a project of its own
//                   (both CLI packages install the bin `octocrawl`)
//
// Usage: node scripts/check-packages.mjs  (after npx tsc -b and pack-packages.mjs; needs the npm registry)

import { execFile, execFileSync, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as netServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { textPdf } from '@w2l/fixtures'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tarballs = join(root, '.w2l', 'pack', 'tarballs')
/** The version the packages were packed at: the CLI's own, which scripts/release-version.mjs keeps equal to the others. */
const version = JSON.parse(readFileSync(join(root, 'packages', 'cli', 'package.json'), 'utf8')).version
const project = mkdtempSync(join(tmpdir(), 'octocrawl-package-check-'))
const aliasProject = mkdtempSync(join(tmpdir(), 'octocrawl-unscoped-check-'))
const results = []
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`) }

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning. '.repeat(3)
const PAGE = `<!doctype html><html lang="en"><head><title>Tides</title></head><body><main><article><h1>Tides</h1><p>${PROSE}</p><table><tr><th>Station</th><th>Height</th></tr><tr><td>North</td><td>4.2</td></tr></table></article></main></body></html>`
const PDF = textPdf([['Annual data summary', 'Capacity reached 120 MW.'], ['Portfolio PUE: 1.32']])
const site = createServer((req, res) => {
  if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
  if (req.url === '/report.pdf') return void res.writeHead(200, { 'content-type': 'application/pdf' }).end(Buffer.from(PDF))
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
})
await new Promise((done) => site.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${site.address().port}`
const env = { ...process.env, W2L_TASK_ROOT: join(project, 'tasks'), NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' }
// Asynchronous: the loopback site answers from this process, so a synchronous child would wait on it forever.
const run = async (command, args) => (await promisify(execFile)(command, args, { cwd: project, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })).stdout

let serve
try {
  // better-sqlite3 needs its install script (its native binding); npm 11 runs it only when the project allows it.
  writeFileSync(join(project, 'package.json'), `${JSON.stringify({ name: 'w2l-package-check', version: '1.0.0', private: true, allowScripts: { 'better-sqlite3': true } }, null, 2)}\n`)
  const all = readdirSync(tarballs).filter((file) => file.endsWith('.tgz'))
  const files = all.filter((file) => file.startsWith('octocrawl-') && !/^octocrawl-\d/.test(file)).map((file) => join(tarballs, file))
  execFileSync('npm', ['install', '--no-audit', '--no-fund', ...files], { cwd: project, stdio: 'inherit', env })
  check('install', true, files.map((file) => file.split('/').pop()).join(', '))

  const scraped = JSON.parse(await run('npx', ['octocrawl', 'scrape', `${origin}/tides`, '--formats', 'markdown,tables']))
  check('cli scrape', scraped.status === 'success' && scraped.tables?.[0]?.csv === 'Station,Height\r\nNorth,4.2\r\n' && scraped.evidenceRecord?.status === 'success', `${scraped.status}, ${scraped.tables?.length} table`)
  const pdf = JSON.parse(await run('npx', ['octocrawl', 'scrape', `${origin}/report.pdf`, '--parsers', '{"type":"pdf","pages":true}']))
  check('cli scrape pdf', pdf.status === 'success' && pdf.pages?.length === 2 && pdf.markdown?.includes('Portfolio PUE: 1.32'), `${pdf.status}, ${pdf.pages?.length} pages`)
  // Run by its real path, as Windows and pnpm shims run it: only the CLI's own entry may run.
  // The real path: on macOS the temp directory itself is reached through a symlink, which would hide a stray guard.
  const direct = await promisify(execFile)('node', [join(realpathSync(project), 'node_modules', '@octocrawl', 'cli', 'dist', 'cli.js'), '--version'], { cwd: project, env, encoding: 'utf8', timeout: 20_000 }).then((out) => out, (error) => error)
  check('cli by its real path', direct.stdout?.trim() === version && (direct.stderr ?? '').trim() === '' && direct.code === undefined, JSON.stringify({ stdout: direct.stdout?.trim(), stderr: direct.stderr?.trim().slice(0, 120), code: direct.code, killed: direct.killed }))
  let refused = 0
  try { await run('npx', ['octocrawl', 'scrape', `${origin}/tides`, '--max-age', '-1']) } catch (error) { refused = error.code }
  check('cli refusal', refused === 2, `exit ${refused}`)

  const port = await new Promise((done) => { const probe = netServer().listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)) }) })
  serve = spawn('npx', ['octocrawl', 'serve', '--port', String(port)], { cwd: project, env, stdio: ['ignore', 'ignore', 'pipe'] })
  const api = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${api}/v1/crawl/active`).then((res) => res.ok, () => false)) break
    await new Promise((done) => setTimeout(done, 100))
  }
  check('cli serve', await fetch(`${api}/v1/crawl/active`).then((res) => res.ok, () => false), api)

  writeFileSync(join(project, 'esm.mjs'), `import { W2L, SDK_VERSION } from '@octocrawl/sdk'\nconst r = await new W2L({ baseUrl: '${api}' }).scrape('${origin}/tides', { formats: ['markdown'] })\nconsole.log(JSON.stringify({ version: SDK_VERSION, status: r.status, lane: r.lane }))\n`)
  writeFileSync(join(project, 'cjs.cjs'), `const { W2L } = require('@octocrawl/sdk')\nnew W2L({ baseUrl: '${api}' }).scrape('${origin}/tides').then((r) => console.log(JSON.stringify({ status: r.status })))\n`)
  const esm = JSON.parse(await run('node', ['esm.mjs']))
  check('sdk esm', esm.status === 'success', JSON.stringify(esm))
  const cjs = JSON.parse(await run('node', ['cjs.cjs']))
  check('sdk cjs', cjs.status === 'success', JSON.stringify(cjs))
  // The types resolve for a TypeScript user of either module system.
  writeFileSync(join(project, 'types.ts'), `import { W2L, type ScrapeResponse, type EvidenceRecord } from '@octocrawl/sdk'\nconst client: W2L = new W2L({ baseUrl: 'http://127.0.0.1:1' })\nconst record: EvidenceRecord | undefined = undefined as unknown as ScrapeResponse['evidenceRecord']\nvoid client; void record\n`)
  // The same file as an ES module (.mts) and as CommonJS (.cts): the import and require declarations both resolve.
  writeFileSync(join(project, 'types.mts'), readFileSync(join(project, 'types.ts'), 'utf8'))
  writeFileSync(join(project, 'types.cts'), readFileSync(join(project, 'types.ts'), 'utf8'))
  for (const file of ['types.mts', 'types.cts']) {
    let typesOk = true
    let typesDetail = 'tsc --noEmit, module nodenext'
    try { execFileSync(join(root, 'node_modules', '.bin', 'tsc'), ['--noEmit', '--strict', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--skipLibCheck', 'false', file], { cwd: project, encoding: 'utf8' }) } catch (error) { typesOk = false; typesDetail = String(error.stdout).slice(0, 400) }
    check(`sdk types (${file})`, typesOk, typesDetail)
  }

  const answers = await mcpSession(api)
  check('mcp initialize', answers[0]?.result?.serverInfo?.name !== undefined, answers[0]?.result?.serverInfo?.name)
  check('mcp tools/list', Array.isArray(answers[1]?.result?.tools) && answers[1].result.tools.some((tool) => tool.name === 'scrape'), `${answers[1]?.result?.tools?.length} tools`)
  const text = answers[2]?.result?.content?.[0]?.text ?? ''
  check('mcp scrape', text.includes('"status": "success"') || text.includes('"status":"success"'), text.slice(0, 80).replace(/\s+/g, ' '))

  // The unscoped `octocrawl`, alone in a project of its own: `npx octocrawl` runs the CLI.
  const unscoped = all.filter((file) => /^octocrawl-\d/.test(file)).map((file) => join(tarballs, file))
  writeFileSync(join(aliasProject, 'package.json'), readFileSync(join(project, 'package.json'), 'utf8'))
  execFileSync('npm', ['install', '--no-audit', '--no-fund', ...unscoped], { cwd: aliasProject, stdio: 'inherit', env })
  const aliasScrape = JSON.parse((await promisify(execFile)('npx', ['octocrawl', 'scrape', `${origin}/tides`], { cwd: aliasProject, env: { ...env, W2L_TASK_ROOT: join(aliasProject, 'tasks') }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })).stdout)
  check('unscoped octocrawl', unscoped.length === 1 && aliasScrape.status === 'success', `${unscoped.map((file) => file.split('/').pop()).join(', ')}: ${aliasScrape.status}`)
} catch (error) {
  check('run', false, error instanceof Error ? `${error.message}\n${error.stderr ?? ''}`.slice(0, 2000) : String(error))
} finally {
  serve?.kill('SIGINT')
  await new Promise((done) => site.close(done))
  rmSync(project, { recursive: true, force: true })
  rmSync(aliasProject, { recursive: true, force: true })
}
const failed = results.filter((result) => !result.pass).length
console.log(`${results.length - failed} of ${results.length} checks passed`)
process.exitCode = failed === 0 ? 0 : 1

/** One stdio session with the installed octocrawl-mcp: initialize, tools/list, one scrape call; each answer by its id. */
async function mcpSession(api) {
  const child = spawn('npx', ['octocrawl-mcp', '--base-url', api], { cwd: project, env, stdio: ['pipe', 'pipe', 'pipe'] })
  const answers = []
  let buffer = ''
  const waiting = new Map()
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at)
      buffer = buffer.slice(at + 1)
      if (line.trim() === '') continue
      const message = JSON.parse(line)
      if (message.id !== undefined) { answers[message.id] = message; waiting.get(message.id)?.() }
    }
  })
  // Every wait ends: on the answer, when the server exits, or after 30 s.
  const send = (message) => new Promise((done) => {
    if (message.id === undefined) { child.stdin.write(`${JSON.stringify(message)}\n`); return done() }
    const timer = setTimeout(done, 30_000)
    waiting.set(message.id, () => { clearTimeout(timer); done() })
    child.stdin.write(`${JSON.stringify(message)}\n`)
  })
  child.on('exit', () => { for (const done of waiting.values()) done() })
  const timeout = setTimeout(() => child.kill(), 120_000)
  await send({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'w2l-package-check', version: '1.0.0' } } })
  await send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  await send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  await send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'scrape', arguments: { url: `${origin}/tides` } } })
  clearTimeout(timeout)
  child.kill()
  return answers
}
